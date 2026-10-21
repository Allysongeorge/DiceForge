
"use strict";

// ============================================
// DICEFORGE RPG - MOTOR DE ROLAGEM
// ============================================

const MAX_DICE = 100;
const MAX_SIDES = 1000;
const MAX_HISTORY = 20;

// Elementos da página
const form = document.getElementById("roll-form");
const expressionInput = document.getElementById("expression");
const rollButton = document.getElementById("roll-button");

const diceResults = document.getElementById("dice-results");
const resultDescription = document.getElementById("result-description");
const totalResult = document.getElementById("total-result");
const averageResult = document.getElementById("average-result");
const minResult = document.getElementById("min-result");
const maxResult = document.getElementById("max-result");

const errorMessage = document.getElementById("error-message");
const historyList = document.getElementById("history-list");
const historyCount = document.getElementById("history-count");
const clearHistoryButton = document.getElementById("clear-history");

const quickRollButtons = document.querySelectorAll(".quick-roll");

// Histórico salvo no navegador
let history = loadHistory();

// ============================================
// 1. INTERPRETAR A EXPRESSÃO
// ============================================

function parseExpression(expression) {
  const normalized = expression
    .toLowerCase()
    .replace(/\s+/g, "");

  if (!normalized) {
    throw new Error("Digite uma expressão de rolagem.");
  }

  const terms = [];
  let position = 0;

  while (position < normalized.length) {
    let sign = 1;

    if (normalized[position] === "+") {
      position++;
    } else if (normalized[position] === "-") {
      sign = -1;
      position++;
    } else if (position > 0) {
      throw new Error(
        "Use + ou - entre os termos da expressão."
      );
    }

    const remaining = normalized.slice(position);

    // Termo de dado: 2d20, d6, 3d8...
    const diceMatch = remaining.match(/^(\d*)d(\d+)/);

    if (diceMatch) {
      const quantity = diceMatch[1] === ""
        ? 1
        : Number(diceMatch[1]);

      const sides = Number(diceMatch[2]);

      if (quantity < 1 || quantity > MAX_DICE) {
        throw new Error(
          `Cada grupo deve ter entre 1 e ${MAX_DICE} dados.`
        );
      }

      if (
        !Number.isSafeInteger(sides) ||
        sides < 2 ||
        sides > MAX_SIDES
      ) {
        throw new Error(
          `Cada dado deve ter entre 2 e ${MAX_SIDES} lados.`
        );
      }

      terms.push({
        type: "dice",
        quantity,
        sides,
        sign
      });

      position += diceMatch[0].length;
      continue;
    }

    // Termo numérico: +5, -3, +10...
    const numberMatch = remaining.match(/^\d+/);

    if (numberMatch) {
      const value = Number(numberMatch[0]);

      if (
        !Number.isSafeInteger(value) ||
        value > 1000000
      ) {
        throw new Error(
          "Os modificadores devem estar entre -1000000 e 1000000."
        );
      }

      terms.push({
        type: "modifier",
        value,
        sign
      });

      position += numberMatch[0].length;
      continue;
    }

    throw new Error(
      `Não consegui interpretar: "${remaining}".`
    );
  }

  if (terms.length === 0) {
    throw new Error("A expressão não contém termos válidos.");
  }

  return terms;
}

// ============================================
// 2. ROLAR OS DADOS
// ============================================

function rollDie(sides) {
  // Gera um inteiro uniforme entre 1 e sides,
  // inclusive, usando a API criptográfica do navegador.
  const range = 0x100000000;
  const limit = Math.floor(range / sides) * sides;

  const buffer = new Uint32Array(1);
  let value;

  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);

  return (value % sides) + 1;
}

function rollExpression(expression) {
  const terms = parseExpression(expression);

  const dice = [];
  let modifierTotal = 0;
  let minimum = 0;
  let maximum = 0;

  for (const term of terms) {
    if (term.type === "modifier") {
      const modifier = term.sign * term.value;

      modifierTotal += modifier;
      minimum += modifier;
      maximum += modifier;

      continue;
    }

    for (let i = 0; i < term.quantity; i++) {
      const value = rollDie(term.sides) * term.sign;

      dice.push({
        sides: term.sides,
        value,
        sign: term.sign
      });

      if (term.sign === 1) {
        minimum += 1;
        maximum += term.sides;
      } else {
        minimum -= term.sides;
        maximum -= 1;
      }
    }
  }

  const diceTotal = dice.reduce(
    (sum, die) => sum + die.value,
    0
  );

  const total = diceTotal + modifierTotal;

  const average = dice.length > 0
    ? dice.reduce((sum, die) => sum + Math.abs(die.value), 0)
      / dice.length
    : null;

  return {
    expression,
    dice,
    modifierTotal,
    diceTotal,
    total,
    average,
    minimum,
    maximum,
    date: new Date().toISOString()
  };
}

// ============================================
// 3. MOSTRAR OS RESULTADOS
// ============================================

function displayResult(result) {
  diceResults.replaceChildren();

  if (result.dice.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "Esta expressão contém apenas modificadores.";
    diceResults.appendChild(message);
  }

  result.dice.forEach((die, index) => {
    const card = document.createElement("div");
    card.className = "die";

    const value = document.createElement("strong");
    value.className = "die-value";
    value.textContent = die.value;

    const label = document.createElement("span");
    label.className = "die-label";
    label.textContent =
      `Dado ${index + 1} · d${die.sides}`;

    card.append(value, label);
    diceResults.appendChild(card);
  });

  totalResult.textContent = result.total;

  averageResult.textContent = result.average === null
    ? "N/A"
    : result.average.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

  minResult.textContent = result.minimum;
  maxResult.textContent = result.maximum;

  resultDescription.textContent =
    `${result.dice.length} dado(s) · Modificadores: ${result.modifierTotal >= 0 ? "+" : ""}${result.modifierTotal}`;

  errorMessage.textContent = "";
}

// ============================================
// 4. HISTÓRICO DE ROLAGENS
// ============================================

function loadHistory() {
  try {
    const saved = localStorage.getItem("diceforge-history");

    if (!saved) return [];

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(item =>
        item &&
        typeof item.expression === "string" &&
        Number.isSafeInteger(item.total) &&
        typeof item.date === "string" &&
        Array.isArray(item.dice) &&
        item.dice.every(die =>
          die &&
          Number.isSafeInteger(die.value) &&
          Number.isSafeInteger(die.sides)
        )
      )
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveHistory() {
  try {
    localStorage.setItem(
      "diceforge-history",
      JSON.stringify(history)
    );
  } catch {
    errorMessage.textContent =
      "Rolagem realizada, mas não foi possível salvar o histórico no navegador.";
  }
}

function addToHistory(result) {
  history.unshift(result);
  history = history.slice(0, MAX_HISTORY);

  saveHistory();
  displayHistory();
}

function displayHistory() {
  historyList.replaceChildren();

  historyCount.textContent =
    `${history.length} rolagem(ns)`;

  if (history.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "Nenhuma rolagem registrada.";

    historyList.appendChild(empty);
    return;
  }

  history.forEach((item, index) => {
    const row = document.createElement("li");
    row.className = "history-item";

    const details = document.createElement("div");

    const expression = document.createElement("div");
    expression.className = "history-expression";
    expression.textContent = item.expression;

    const total = document.createElement("strong");
    total.className = "history-total";
    total.textContent = `Total: ${item.total}`;

    details.append(expression, total);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "history-delete";
    removeButton.textContent = "Excluir";
    removeButton.setAttribute(
      "aria-label",
      `Excluir rolagem ${item.expression}`
    );

    removeButton.addEventListener("click", () => {
      history.splice(index, 1);
      saveHistory();
      displayHistory();
    });

    row.append(details, removeButton);
    historyList.appendChild(row);
  });
}

// ============================================
// 5. EXECUTAR UMA ROLAGEM
// ============================================

function executeRoll(expression) {
  try {
    rollButton.disabled = true;

    const result = rollExpression(expression);

    displayResult(result);
    addToHistory(result);
  } catch (error) {
    errorMessage.textContent =
      error instanceof Error
        ? error.message
        : "Ocorreu um erro inesperado.";
  } finally {
    rollButton.disabled = false;
  }
}

// ============================================
// 6. EVENTOS DOS BOTÕES
// ============================================

form.addEventListener("submit", event => {
  event.preventDefault();

  executeRoll(expressionInput.value);
});

quickRollButtons.forEach(button => {
  button.addEventListener("click", () => {
    const expression = button.dataset.expression;

    expressionInput.value = expression;
    executeRoll(expression);
  });
});

clearHistoryButton.addEventListener("click", () => {
  history = [];
  saveHistory();
  displayHistory();
});

// ============================================
// 7. INICIALIZAÇÃO
// ============================================

displayHistory();
