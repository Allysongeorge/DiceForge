
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
  const normalized = expression.toLowerCase().replace(/\s+/g, "");
  if (!normalized) throw new Error("Digite uma expressão.");

  const tokens = normalized.match(/\d*d\d+|\d+|[()+\-*/]/g) || [];
  if (tokens.join("") !== normalized) {
    throw new Error("Expressão inválida. Confira os símbolos utilizados.");
  }

  let position = 0;
  let diceCount = 0;

  function peek() {
    return tokens[position];
  }

  function consume() {
    return tokens[position++];
  }

  function parsePrimary() {
    const token = consume();

    if (token === undefined) {
      throw new Error("Expressão incompleta.");
    }

    if (token === "(") {
      const node = parseAddSub();
      if (consume() !== ")") {
        throw new Error("Está faltando um parêntese de fechamento.");
      }
      return node;
    }

    if (token === "+" || token === "-") {
      return {
        type: "unary",
        sign: token === "-" ? -1 : 1,
        child: parsePrimary()
      };
    }

    if (/^\d*d\d+$/.test(token)) {
      const match = token.match(/^(\d*)d(\d+)$/);
      const quantity = match[1] === "" ? 1 : Number(match[1]);
      const sides = Number(match[2]);

      if (quantity < 1 || quantity > MAX_DICE) {
        throw new Error(`Use entre 1 e ${MAX_DICE} dados por grupo.`);
      }

      if (sides < 2 || sides > MAX_SIDES) {
        throw new Error(`Os dados devem ter entre 2 e ${MAX_SIDES} lados.`);
      }

      diceCount += quantity;
      if (diceCount > MAX_DICE) {
        throw new Error(`O limite total é de ${MAX_DICE} dados por rolagem.`);
      }

      return { type: "dice", quantity, sides };
    }

    if (/^\d+$/.test(token)) {
      const value = Number(token);
      if (!Number.isSafeInteger(value) || value > 1000000) {
        throw new Error("Número muito grande.");
      }
      return { type: "number", value };
    }

    throw new Error(`Não esperava "${token}".`);
  }

  function parseMulDiv() {
    let node = parsePrimary();

    while (peek() === "*" || peek() === "/") {
      const operator = consume();
      node = { type: "binary", operator, left: node, right: parsePrimary() };
    }

    return node;
  }

  function parseAddSub() {
    let node = parseMulDiv();

    while (peek() === "+" || peek() === "-") {
      const operator = consume();
      node = { type: "binary", operator, left: node, right: parseMulDiv() };
    }

    return node;
  }

  const ast = parseAddSub();

  if (position !== tokens.length) {
    throw new Error(`Símbolo inesperado: "${peek()}".`);
  }

  return ast;
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
  const ast = parseExpression(expression);
  const dice = [];

  function calculate(node, mode) {
    if (node.type === "number") return node.value;

    if (node.type === "unary") {
      return node.sign * calculate(node.child, mode);
    }

    if (node.type === "dice") {
      if (mode === "total") {
        let sum = 0;

        for (let i = 0; i < node.quantity; i++) {
          const value = rollDie(node.sides);
          dice.push({ sides: node.sides, value, sign: 1 });
          sum += value;
        }

        return sum;
      }

      if (mode === "average") {
        return node.quantity * (node.sides + 1) / 2;
      }

      if (mode === "minimum") return node.quantity;
      if (mode === "maximum") return node.quantity * node.sides;
    }

    if (node.type === "binary") {
      const left = calculate(node.left, mode);
      const right = calculate(node.right, mode);

      if (node.operator === "+") return left + right;
      if (node.operator === "-") return left - right;
      if (node.operator === "*") return left * right;

      if (node.operator === "/") {
        if (right === 0) {
          throw new Error("Não é possível dividir por zero.");
        }
        return left / right;
      }
    }

    throw new Error("Não foi possível calcular essa expressão.");
  }

  const total = calculate(ast, "total");
  const average = calculate(ast, "average");
  const minimum = calculate(ast, "minimum");
  const maximum = calculate(ast, "maximum");

  return {
    expression,
    dice,
    modifierTotal: 0,
    diceTotal: total,
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
