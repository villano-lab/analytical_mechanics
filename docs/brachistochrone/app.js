"use strict";

const GRAVITY = 9.81;
const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_CONTROL_POINTS = [
  { x: 0.16, y: 0.48 },
  { x: 0.36, y: 0.82 },
  { x: 0.62, y: 1.04 },
  { x: 0.84, y: 1.02 },
];

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
  showCycloid: document.querySelector("#show-cycloid"),
  raceButton: document.querySelector("#race-button"),
  resetButton: document.querySelector("#reset-button"),
  raceStatus: document.querySelector("#race-status"),
  grid: document.querySelector("#grid"),
  plot: document.querySelector("#track-plot"),
  controlPoints: document.querySelector("#control-points"),
  straightPath: document.querySelector("#straight-path"),
  customPath: document.querySelector("#custom-path"),
  cycloidPath: document.querySelector("#cycloid-path"),
  straightBead: document.querySelector("#straight-bead"),
  customBead: document.querySelector("#custom-bead"),
  cycloidBead: document.querySelector("#cycloid-bead"),
  startMarker: document.querySelector("#start-marker"),
  endMarker: document.querySelector("#end-marker"),
  startLabel: document.querySelector("#start-label"),
  endLabel: document.querySelector("#end-label"),
  customTime: document.querySelector("#custom-time"),
  plotCustomTime: document.querySelector("#plot-custom-time"),
  straightTime: document.querySelector("#straight-time"),
  cycloidTime: document.querySelector("#cycloid-time"),
  cycloidEvaluation: document.querySelector("#cycloid-evaluation"),
  cycloidLegend: document.querySelector("#cycloid-legend"),
  cycloidExplanation: document.querySelector("#cycloid-explanation"),
};

let controlPoints = structuredClone(DEFAULT_CONTROL_POINTS);
let model;
let animationFrame;
let draggedPointIndex = null;

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

function catmullRomPoint(point0, point1, point2, point3, parameter) {
  const parameter2 = parameter * parameter;
  const parameter3 = parameter2 * parameter;

  return {
    x:
      0.5 *
      (2 * point1.x +
        (-point0.x + point2.x) * parameter +
        (2 * point0.x - 5 * point1.x + 4 * point2.x - point3.x) * parameter2 +
        (-point0.x + 3 * point1.x - 3 * point2.x + point3.x) * parameter3),
    y:
      0.5 *
      (2 * point1.y +
        (-point0.y + point2.y) * parameter +
        (2 * point0.y - 5 * point1.y + 4 * point2.y - point3.y) * parameter2 +
        (-point0.y + 3 * point1.y - 3 * point2.y + point3.y) * parameter3),
  };
}

function sampleSmoothCurve(knots, samplesPerSegment = 55) {
  const sampled = [];

  for (let segment = 0; segment < knots.length - 1; segment += 1) {
    const point0 = knots[Math.max(0, segment - 1)];
    const point1 = knots[segment];
    const point2 = knots[segment + 1];
    const point3 = knots[Math.min(knots.length - 1, segment + 2)];

    for (let sample = 0; sample <= samplesPerSegment; sample += 1) {
      if (segment > 0 && sample === 0) continue;
      const point = catmullRomPoint(point0, point1, point2, point3, sample / samplesPerSegment);
      sampled.push({ x: point.x, y: Math.max(point.y, 0) });
    }
  }

  return sampled;
}

function integrateTravelTime(points) {
  const cumulativeTimes = [0];
  let totalTime = 0;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
    const midpointHeight = Math.max((previous.y + current.y) / 2, 1e-9);
    totalTime += distance / Math.sqrt(2 * GRAVITY * midpointHeight);
    cumulativeTimes.push(totalTime);
  }

  return { totalTime, cumulativeTimes };
}

function calculateModel(horizontalDistance, verticalDrop) {
  const finalTheta = solveFinalTheta(horizontalDistance, verticalDrop);
  const cycloidScale = verticalDrop / (1 - Math.cos(finalTheta));
  const cycloidTime = Math.sqrt(cycloidScale / GRAVITY) * finalTheta;
  const straightLength = Math.hypot(horizontalDistance, verticalDrop);
  const straightTime = straightLength * Math.sqrt(2 / (GRAVITY * verticalDrop));
  const customKnots = [
    { x: 0, y: 0 },
    ...controlPoints.map((point) => ({
      x: point.x * horizontalDistance,
      y: point.y * verticalDrop,
    })),
    { x: horizontalDistance, y: verticalDrop },
  ];
  const customSamples = sampleSmoothCurve(customKnots);
  const customTiming = integrateTravelTime(customSamples);

  const cycloidSamples = [];
  for (let index = 0; index <= 320; index += 1) {
    const theta = (finalTheta * index) / 320;
    cycloidSamples.push({
      x: cycloidScale * (theta - Math.sin(theta)),
      y: cycloidScale * (1 - Math.cos(theta)),
    });
  }

  return {
    horizontalDistance,
    verticalDrop,
    finalTheta,
    cycloidScale,
    cycloidTime,
    straightTime,
    customKnots,
    customSamples,
    customTiming,
    cycloidSamples,
  };
}

function yLimit() {
  const baseLimit = model.verticalDrop * 1.7;
  if (!elements.showCycloid.checked) return baseLimit;
  return Math.max(baseLimit, model.cycloidScale * 2 * 1.08);
}

function toScreen(point) {
  const innerWidth = plot.width - plot.left - plot.right;
  const innerHeight = plot.height - plot.top - plot.bottom;

  return {
    x: plot.left + (point.x / model.horizontalDistance) * innerWidth,
    y: plot.top + (point.y / yLimit()) * innerHeight,
  };
}

function fromScreen(screenPoint) {
  const innerWidth = plot.width - plot.left - plot.right;
  const innerHeight = plot.height - plot.top - plot.bottom;

  return {
    x: ((screenPoint.x - plot.left) / innerWidth) * model.horizontalDistance,
    y: ((screenPoint.y - plot.top) / innerHeight) * yLimit(),
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

function pointAtTime(points, cumulativeTimes, elapsed) {
  if (elapsed <= 0) return points[0];
  const totalTime = cumulativeTimes[cumulativeTimes.length - 1];
  if (elapsed >= totalTime) return points[points.length - 1];

  let low = 0;
  let high = cumulativeTimes.length - 1;
  while (low + 1 < high) {
    const midpoint = Math.floor((low + high) / 2);
    if (cumulativeTimes[midpoint] <= elapsed) low = midpoint;
    else high = midpoint;
  }

  const interval = cumulativeTimes[high] - cumulativeTimes[low];
  const fraction = interval > 0 ? (elapsed - cumulativeTimes[low]) / interval : 0;
  return {
    x: points[low].x + (points[high].x - points[low].x) * fraction,
    y: points[low].y + (points[high].y - points[low].y) * fraction,
  };
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

function drawControlPoints() {
  elements.controlPoints.replaceChildren();
  model.customKnots.slice(1, -1).forEach((point, index) => {
    const screen = toScreen(point);
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "control-point");
    group.dataset.index = String(index);

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", screen.x);
    circle.setAttribute("cy", screen.y);
    circle.setAttribute("r", "15");
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("aria-label", `Trial curve point ${index + 1}`);

    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", screen.x);
    label.setAttribute("y", screen.y + 5);
    label.textContent = String(index + 1);

    group.append(circle, label);
    elements.controlPoints.append(group);
  });
}

function render() {
  cancelAnimationFrame(animationFrame);
  model = calculateModel(Number(elements.distance.value), Number(elements.drop.value));
  const showCycloid = elements.showCycloid.checked;

  elements.distanceOutput.value = `${model.horizontalDistance.toFixed(1)} m`;
  elements.dropOutput.value = `${model.verticalDrop.toFixed(1)} m`;
  elements.customTime.value = `${model.customTiming.totalTime.toFixed(3)} s`;
  elements.plotCustomTime.textContent = `${model.customTiming.totalTime.toFixed(3)} s`;
  elements.straightTime.value = `${model.straightTime.toFixed(3)} s`;
  elements.cycloidTime.value = `${model.cycloidTime.toFixed(3)} s`;
  elements.raceStatus.textContent = "Ready";

  elements.cycloidPath.toggleAttribute("hidden", !showCycloid);
  elements.cycloidBead.toggleAttribute("hidden", !showCycloid);
  elements.cycloidEvaluation.toggleAttribute("hidden", !showCycloid);
  elements.cycloidLegend.toggleAttribute("hidden", !showCycloid);
  elements.cycloidExplanation.toggleAttribute("hidden", !showCycloid);

  const start = { x: 0, y: 0 };
  const finish = { x: model.horizontalDistance, y: model.verticalDrop };
  elements.customPath.setAttribute("d", pathData(model.customSamples));
  elements.straightPath.setAttribute("d", pathData([start, finish]));
  elements.cycloidPath.setAttribute("d", pathData(model.cycloidSamples));

  setPosition(elements.customBead, start);
  setPosition(elements.straightBead, start);
  setPosition(elements.cycloidBead, start);
  setPosition(elements.startMarker, start);
  setPosition(elements.endMarker, finish);
  drawControlPoints();

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
  const visibleTimes = [model.customTiming.totalTime, model.straightTime];
  if (elements.showCycloid.checked) visibleTimes.push(model.cycloidTime);
  const totalDuration = Math.max(...visibleTimes);
  const winningTime = Math.min(...visibleTimes);
  const winner =
    winningTime === model.cycloidTime && elements.showCycloid.checked
      ? "Cycloid"
      : winningTime === model.customTiming.totalTime
        ? "Trial curve"
        : "Straight line";
  let announcedWinner = false;
  elements.raceStatus.textContent = "Racing";

  function frame(now) {
    const elapsed = Math.min((now - startedAt) / 1000, totalDuration);

    setPosition(
      elements.customBead,
      pointAtTime(model.customSamples, model.customTiming.cumulativeTimes, elapsed),
    );

    const straightFraction = Math.min((elapsed / model.straightTime) ** 2, 1);
    setPosition(elements.straightBead, {
      x: model.horizontalDistance * straightFraction,
      y: model.verticalDrop * straightFraction,
    });

    if (elements.showCycloid.checked) {
      const theta = Math.min(
        elapsed / Math.sqrt(model.cycloidScale / GRAVITY),
        model.finalTheta,
      );
      setPosition(elements.cycloidBead, {
        x: model.cycloidScale * (theta - Math.sin(theta)),
        y: model.cycloidScale * (1 - Math.cos(theta)),
      });
    }

    if (!announcedWinner && elapsed >= winningTime) {
      elements.raceStatus.textContent = `${winner} finished first`;
      announcedWinner = true;
    }

    if (elapsed < totalDuration) animationFrame = requestAnimationFrame(frame);
    else elements.raceStatus.textContent = "Race complete";
  }

  animationFrame = requestAnimationFrame(frame);
}

function svgPointFromEvent(event) {
  const point = elements.plot.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(elements.plot.getScreenCTM().inverse());
}

function updateDraggedPoint(event) {
  if (draggedPointIndex === null) return;
  const world = fromScreen(svgPointFromEvent(event));
  const normalizedX = world.x / model.horizontalDistance;
  const normalizedY = world.y / model.verticalDrop;
  const previousX = draggedPointIndex === 0 ? 0 : controlPoints[draggedPointIndex - 1].x;
  const nextX =
    draggedPointIndex === controlPoints.length - 1
      ? 1
      : controlPoints[draggedPointIndex + 1].x;

  controlPoints[draggedPointIndex] = {
    x: Math.min(nextX - 0.035, Math.max(previousX + 0.035, normalizedX)),
    y: Math.min(1.62, Math.max(0.06, normalizedY)),
  };
  render();
}

elements.controlPoints.addEventListener("pointerdown", (event) => {
  const group = event.target.closest(".control-point");
  if (!group) return;
  draggedPointIndex = Number(group.dataset.index);
  elements.plot.setPointerCapture(event.pointerId);
  elements.plot.classList.add("dragging");
});

elements.controlPoints.addEventListener("keydown", (event) => {
  const group = event.target.closest(".control-point");
  if (!group || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }

  event.preventDefault();
  const index = Number(group.dataset.index);
  const point = controlPoints[index];
  const previousX = index === 0 ? 0 : controlPoints[index - 1].x;
  const nextX = index === controlPoints.length - 1 ? 1 : controlPoints[index + 1].x;
  const xStep = event.key === "ArrowLeft" ? -0.02 : event.key === "ArrowRight" ? 0.02 : 0;
  const yStep = event.key === "ArrowUp" ? -0.04 : event.key === "ArrowDown" ? 0.04 : 0;

  controlPoints[index] = {
    x: Math.min(nextX - 0.035, Math.max(previousX + 0.035, point.x + xStep)),
    y: Math.min(1.62, Math.max(0.06, point.y + yStep)),
  };
  render();
});

elements.plot.addEventListener("pointermove", updateDraggedPoint);
elements.plot.addEventListener("pointerup", (event) => {
  if (draggedPointIndex === null) return;
  draggedPointIndex = null;
  elements.plot.releasePointerCapture(event.pointerId);
  elements.plot.classList.remove("dragging");
});

elements.plot.addEventListener("pointercancel", () => {
  draggedPointIndex = null;
  elements.plot.classList.remove("dragging");
});

function resetCurve() {
  controlPoints = structuredClone(DEFAULT_CONTROL_POINTS);
  render();
}

elements.distance.addEventListener("input", render);
elements.drop.addEventListener("input", render);
elements.showCycloid.addEventListener("change", render);
elements.raceButton.addEventListener("click", runRace);
elements.resetButton.addEventListener("click", resetCurve);

drawGrid();
render();
