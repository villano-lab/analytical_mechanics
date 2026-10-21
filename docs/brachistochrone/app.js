"use strict";

const GRAVITY = 9.81;
const SVG_NS = "http://www.w3.org/2000/svg";
const plot = {
  width: 900,
  height: 520,
  left: 75,
  right: 55,
  top: 55,
  bottom: 70,
};

const elements = {
  distance: document.querySelector("#distance"),
  drop: document.querySelector("#drop"),
  distanceOutput: document.querySelector("#distance-output"),
  dropOutput: document.querySelector("#drop-output"),
  raceButton: document.querySelector("#race-button"),
  resetButton: document.querySelector("#reset-button"),
  raceStatus: document.querySelector("#race-status"),
  grid: document.querySelector("#grid"),
  straightPath: document.querySelector("#straight-path"),
  cycloidPath: document.querySelector("#cycloid-path"),
  straightBead: document.querySelector("#straight-bead"),
  cycloidBead: document.querySelector("#cycloid-bead"),
  startMarker: document.querySelector("#start-marker"),
  endMarker: document.querySelector("#end-marker"),
  startLabel: document.querySelector("#start-label"),
  endLabel: document.querySelector("#end-label"),
  cycloidTime: document.querySelector("#cycloid-time"),
  straightTime: document.querySelector("#straight-time"),
  timeSaved: document.querySelector("#time-saved"),
};

let model;
let animationFrame;

function endpointEquation(theta, ratio) {
  return (theta - Math.sin(theta)) / (1 - Math.cos(theta)) - ratio;
}

function solveFinalTheta(horizontalDistance, verticalDrop) {
  const ratio = horizontalDistance / verticalDrop;
  let low = 1e-7;
  let high = 2 * Math.PI - 1e-7;

  for (let iteration = 0; iteration < 100; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (endpointEquation(midpoint, ratio) < 0) {
      low = midpoint;
    } else {
      high = midpoint;
    }
  }

  return (low + high) / 2;
}

function calculateModel(horizontalDistance, verticalDrop) {
  const finalTheta = solveFinalTheta(horizontalDistance, verticalDrop);
  const scale = verticalDrop / (1 - Math.cos(finalTheta));
  const cycloidTime = Math.sqrt(scale / GRAVITY) * finalTheta;
  const straightLength = Math.hypot(horizontalDistance, verticalDrop);
  const straightTime = straightLength * Math.sqrt(2 / (GRAVITY * verticalDrop));

  return {
    horizontalDistance,
    verticalDrop,
    finalTheta,
    scale,
    cycloidTime,
    straightTime,
  };
}

function cycloidPoint(theta) {
  return {
    x: model.scale * (theta - Math.sin(theta)),
    y: model.scale * (1 - Math.cos(theta)),
  };
}

function toScreen(point) {
  const innerWidth = plot.width - plot.left - plot.right;
  const innerHeight = plot.height - plot.top - plot.bottom;
  const xScale = innerWidth / model.horizontalDistance;
  const cycloidBottom = model.scale * 2;
  const yLimit = Math.max(model.verticalDrop, cycloidBottom) * 1.12;
  const yScale = innerHeight / yLimit;

  return {
    x: plot.left + point.x * xScale,
    y: plot.top + point.y * yScale,
  };
}

function setPosition(element, point) {
  const screen = toScreen(point);
  element.setAttribute("cx", screen.x.toFixed(2));
  element.setAttribute("cy", screen.y.toFixed(2));
}

function pathData(points) {
  return points
    .map((point, index) => {
      const screen = toScreen(point);
      return `${index === 0 ? "M" : "L"}${screen.x.toFixed(2)},${screen.y.toFixed(2)}`;
    })
    .join(" ");
}

function drawGrid() {
  elements.grid.replaceChildren();
  const innerWidth = plot.width - plot.left - plot.right;
  const innerHeight = plot.height - plot.top - plot.bottom;

  for (let index = 0; index <= 5; index += 1) {
    const vertical = document.createElementNS(SVG_NS, "line");
    const x = plot.left + (innerWidth * index) / 5;
    vertical.setAttribute("x1", x);
    vertical.setAttribute("x2", x);
    vertical.setAttribute("y1", plot.top);
    vertical.setAttribute("y2", plot.top + innerHeight);
    vertical.setAttribute("class", "grid-line");
    elements.grid.append(vertical);

    const horizontal = document.createElementNS(SVG_NS, "line");
    const y = plot.top + (innerHeight * index) / 5;
    horizontal.setAttribute("x1", plot.left);
    horizontal.setAttribute("x2", plot.left + innerWidth);
    horizontal.setAttribute("y1", y);
    horizontal.setAttribute("y2", y);
    horizontal.setAttribute("class", "grid-line");
    elements.grid.append(horizontal);
  }
}

function render() {
  cancelAnimationFrame(animationFrame);
  const horizontalDistance = Number(elements.distance.value);
  const verticalDrop = Number(elements.drop.value);
  model = calculateModel(horizontalDistance, verticalDrop);

  elements.distanceOutput.value = `${horizontalDistance.toFixed(1)} m`;
  elements.dropOutput.value = `${verticalDrop.toFixed(1)} m`;
  elements.cycloidTime.textContent = `${model.cycloidTime.toFixed(3)} s`;
  elements.straightTime.textContent = `${model.straightTime.toFixed(3)} s`;
  elements.timeSaved.textContent = `${(model.straightTime - model.cycloidTime).toFixed(3)} s`;
  elements.raceStatus.textContent = "Ready";

  const cycloidPoints = [];
  for (let index = 0; index <= 180; index += 1) {
    cycloidPoints.push(cycloidPoint((model.finalTheta * index) / 180));
  }

  const start = { x: 0, y: 0 };
  const finish = { x: model.horizontalDistance, y: model.verticalDrop };
  elements.cycloidPath.setAttribute("d", pathData(cycloidPoints));
  elements.straightPath.setAttribute("d", pathData([start, finish]));

  setPosition(elements.cycloidBead, start);
  setPosition(elements.straightBead, start);
  setPosition(elements.startMarker, start);
  setPosition(elements.endMarker, finish);

  const startScreen = toScreen(start);
  const finishScreen = toScreen(finish);
  elements.startLabel.setAttribute("x", startScreen.x + 12);
  elements.startLabel.setAttribute("y", startScreen.y - 14);
  elements.endLabel.setAttribute("x", finishScreen.x - 53);
  elements.endLabel.setAttribute("y", finishScreen.y - 14);
}

function runRace() {
  cancelAnimationFrame(animationFrame);
  const startedAt = performance.now();
  const totalDuration = model.straightTime;
  elements.raceStatus.textContent = "Racing";

  function frame(now) {
    const elapsed = Math.min((now - startedAt) / 1000, totalDuration);

    const cycloidTheta = Math.min(
      elapsed / Math.sqrt(model.scale / GRAVITY),
      model.finalTheta,
    );
    setPosition(elements.cycloidBead, cycloidPoint(cycloidTheta));

    const straightFraction = Math.min((elapsed / model.straightTime) ** 2, 1);
    setPosition(elements.straightBead, {
      x: model.horizontalDistance * straightFraction,
      y: model.verticalDrop * straightFraction,
    });

    if (elapsed < totalDuration) {
      elements.raceStatus.textContent =
        elapsed >= model.cycloidTime ? "Cycloid finished first" : "Racing";
      animationFrame = requestAnimationFrame(frame);
    } else {
      elements.raceStatus.textContent = "Race complete";
    }
  }

  animationFrame = requestAnimationFrame(frame);
}

function reset() {
  cancelAnimationFrame(animationFrame);
  elements.distance.value = "4";
  elements.drop.value = "2";
  render();
}

elements.distance.addEventListener("input", render);
elements.drop.addEventListener("input", render);
elements.raceButton.addEventListener("click", runRace);
elements.resetButton.addEventListener("click", reset);

drawGrid();
render();
