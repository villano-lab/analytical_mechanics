"use strict";

const GRAVITY = 9.81;
const HORIZONTAL_DISTANCE = 10;
const CLASS_RESULTS_STORAGE_KEY = "brachistochrone-class-results-v1";
const SVG_NS = "http://www.w3.org/2000/svg";
const APP_CONFIG = window.BRACHISTOCHRONE_CONFIG || {};
const CLASS_API_BASE_URL = String(APP_CONFIG.apiBaseUrl || "").replace(/\/$/, "");
const CLASS_SESSION_NAME = String(APP_CONFIG.sessionName || "analytical-mechanics-2026");
const USING_SHARED_API = CLASS_API_BASE_URL.length > 0;
const TRIAL_COLORS = [
  "#7655a6",
  "#d14f68",
  "#d9822b",
  "#2f8f83",
  "#3f6fb6",
  "#a55f2a",
  "#9a4d92",
  "#4d8b3a",
];
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
  xMax: HORIZONTAL_DISTANCE,
  yMax: 8,
};

const elements = {
  drop: document.querySelector("#drop"),
  dropOutput: document.querySelector("#drop-output"),
  showCycloid: document.querySelector("#show-cycloid"),
  saveButton: document.querySelector("#save-button"),
  clearTrialsButton: document.querySelector("#clear-trials-button"),
  raceButton: document.querySelector("#race-button"),
  resetButton: document.querySelector("#reset-button"),
  raceStatus: document.querySelector("#race-status"),
  grid: document.querySelector("#grid"),
  savedCurves: document.querySelector("#saved-curves"),
  plot: document.querySelector("#track-plot"),
  historyPlot: document.querySelector("#history-plot"),
  historySummary: document.querySelector("#history-summary"),
  classHistogramPlot: document.querySelector("#class-histogram-plot"),
  classSummary: document.querySelector("#class-summary"),
  classModeLabel: document.querySelector("#class-mode-label"),
  classStorageNote: document.querySelector("#class-storage-note"),
  submitClassButton: document.querySelector("#submit-class-button"),
  resetClassButton: document.querySelector("#reset-class-button"),
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
let savedTrials = [];
let classResults = loadClassResults();
const teacherMode = new URLSearchParams(window.location.search).get("teacher") === "1";

function loadClassResults() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(CLASS_RESULTS_STORAGE_KEY) || "{}");
    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function saveClassResults() {
  try {
    window.localStorage.setItem(CLASS_RESULTS_STORAGE_KEY, JSON.stringify(classResults));
  } catch {
    // The visualization still works if browser storage is unavailable.
  }
}

function currentEndpointKey() {
  return Number(elements.drop.value).toFixed(1);
}

function currentClassTimes() {
  const times = classResults[currentEndpointKey()];
  return Array.isArray(times) ? times : [];
}

function classApiEndpoint() {
  const session = encodeURIComponent(CLASS_SESSION_NAME);
  const drop = encodeURIComponent(currentEndpointKey());
  return `${CLASS_API_BASE_URL}/api/sessions/${session}/submissions?drop=${drop}`;
}

function newSubmissionId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

async function refreshClassResults() {
  if (!USING_SHARED_API) return;

  try {
    const response = await fetch(classApiEndpoint(), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Class API returned ${response.status}`);
    const result = await response.json();
    classResults[currentEndpointKey()] = Array.isArray(result.times)
      ? result.times.map(Number).filter(Number.isFinite)
      : [];
    drawClassHistogram();
  } catch (error) {
    console.error(error);
    elements.classSummary.textContent = "Shared histogram unavailable";
  }
}

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

function sampleSmoothCurve(knots, samplesPerSegment = 120) {
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

    // Integrate 1/sqrt(y) exactly along this straight sample segment. A
    // midpoint estimate badly undercounts time near the singular start y = 0.
    const rootHeightSum = Math.sqrt(previous.y) + Math.sqrt(current.y);
    const segmentTime =
      rootHeightSum > 0
        ? Math.sqrt(2 / GRAVITY) * (distance / rootHeightSum)
        : distance === 0
          ? 0
          : Number.POSITIVE_INFINITY;
    totalTime += segmentTime;
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

function toScreen(point) {
  const innerWidth = plot.width - plot.left - plot.right;
  const innerHeight = plot.height - plot.top - plot.bottom;

  return {
    x: plot.left + (point.x / plot.xMax) * innerWidth,
    y: plot.top + (point.y / plot.yMax) * innerHeight,
  };
}

function fromScreen(screenPoint) {
  const innerWidth = plot.width - plot.left - plot.right;
  const innerHeight = plot.height - plot.top - plot.bottom;

  return {
    x: ((screenPoint.x - plot.left) / innerWidth) * plot.xMax,
    y: ((screenPoint.y - plot.top) / innerHeight) * plot.yMax,
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

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
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

  for (let index = 0; index <= plot.xMax; index += 1) {
    const vertical = document.createElementNS(SVG_NS, "line");
    const x = plot.left + (innerWidth * index) / plot.xMax;
    vertical.setAttribute("x1", x);
    vertical.setAttribute("x2", x);
    vertical.setAttribute("y1", plot.top);
    vertical.setAttribute("y2", plot.top + innerHeight);
    vertical.setAttribute("class", "grid-line");
    elements.grid.append(vertical);

    if (index > 0) {
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", x);
      label.setAttribute("y", plot.top + innerHeight + 27);
      label.setAttribute("class", "tick-label x-tick");
      label.textContent = String(index);
      elements.grid.append(label);
    }
  }

  for (let index = 0; index <= plot.yMax; index += 1) {
    const horizontal = document.createElementNS(SVG_NS, "line");
    const y = plot.top + (innerHeight * index) / plot.yMax;
    horizontal.setAttribute("x1", plot.left);
    horizontal.setAttribute("x2", plot.left + innerWidth);
    horizontal.setAttribute("y1", y);
    horizontal.setAttribute("y2", y);
    horizontal.setAttribute("class", "grid-line");
    elements.grid.append(horizontal);

    if (index > 0) {
      const label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", plot.left - 18);
      label.setAttribute("y", y + 5);
      label.setAttribute("class", "tick-label y-tick");
      label.textContent = String(index);
      elements.grid.append(label);
    }
  }

  const xUnit = document.createElementNS(SVG_NS, "text");
  xUnit.setAttribute("x", plot.left + innerWidth);
  xUnit.setAttribute("y", plot.top + innerHeight + 50);
  xUnit.setAttribute("class", "axis-unit");
  xUnit.textContent = "x (m)";
  elements.grid.append(xUnit);

  const yUnit = document.createElementNS(SVG_NS, "text");
  yUnit.setAttribute("x", plot.left - 48);
  yUnit.setAttribute("y", plot.top + 5);
  yUnit.setAttribute("class", "axis-unit y-unit");
  yUnit.textContent = "y (m)";
  elements.grid.append(yUnit);
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

function drawSavedCurves() {
  elements.savedCurves.replaceChildren();
  if (savedTrials.length === 0) return;

  const bestTime = Math.min(...savedTrials.map((trial) => trial.time));
  savedTrials.forEach((trial, index) => {
    const path = svgElement("path", {
      d: pathData(trial.samples),
      class: `track saved-track${trial.time === bestTime ? " best-saved-track" : ""}`,
      style: `--trial-color: ${trial.color}`,
      "data-index": index,
    });
    elements.savedCurves.append(path);
  });
}

function historyX(time, minimum, maximum) {
  const left = 72;
  const right = 848;
  return left + ((time - minimum) / (maximum - minimum)) * (right - left);
}

function drawHistory() {
  elements.historyPlot.replaceChildren();
  const currentTime = model.customTiming.totalTime;
  const visibleTimes = [currentTime, model.straightTime, ...savedTrials.map((trial) => trial.time)];
  if (elements.showCycloid.checked) visibleTimes.push(model.cycloidTime);

  const rawMinimum = Math.min(...visibleTimes);
  const rawMaximum = Math.max(...visibleTimes);
  const padding = Math.max((rawMaximum - rawMinimum) * 0.09, 0.04);
  const minimum = Math.max(0, rawMinimum - padding);
  const maximum = rawMaximum + padding;
  const axisY = 88;

  elements.historyPlot.append(
    svgElement("line", { x1: 72, x2: 848, y1: axisY, y2: axisY, class: "history-axis" }),
  );

  for (let index = 0; index <= 4; index += 1) {
    const time = minimum + ((maximum - minimum) * index) / 4;
    const x = historyX(time, minimum, maximum);
    const tick = svgElement("line", {
      x1: x,
      x2: x,
      y1: axisY - 6,
      y2: axisY + 6,
      class: "history-tick",
    });
    const label = svgElement("text", { x, y: 116, class: "history-tick-label" });
    label.textContent = `${time.toFixed(2)} s`;
    elements.historyPlot.append(tick, label);
  }

  if (elements.showCycloid.checked) {
    const x = historyX(model.cycloidTime, minimum, maximum);
    const line = svgElement("line", {
      x1: x,
      x2: x,
      y1: 20,
      y2: axisY + 7,
      class: "history-cycloid-line",
    });
    const label = svgElement("text", { x: x + 7, y: 26, class: "history-cycloid-label" });
    label.textContent = `Cycloid ${model.cycloidTime.toFixed(3)} s`;
    elements.historyPlot.append(line, label);
  }

  const currentX = historyX(currentTime, minimum, maximum);
  const currentDot = svgElement("circle", {
    cx: currentX,
    cy: 51,
    r: 9,
    class: "history-current-dot",
  });
  const currentLabel = svgElement("text", {
    x: currentX,
    y: 35,
    class: "history-current-label",
  });
  currentLabel.textContent = `Current ${currentTime.toFixed(3)} s`;
  elements.historyPlot.append(currentDot, currentLabel);

  const bestTime = savedTrials.length
    ? Math.min(...savedTrials.map((trial) => trial.time))
    : Number.POSITIVE_INFINITY;
  savedTrials.forEach((trial, index) => {
    const x = historyX(trial.time, minimum, maximum);
    const dot = svgElement("circle", {
      cx: x,
      cy: axisY,
      r: trial.time === bestTime ? 9 : 7,
      class: `history-saved-dot${trial.time === bestTime ? " best" : ""}`,
      style: `--trial-color: ${trial.color}`,
      tabindex: 0,
      role: "button",
      "data-index": index,
      "aria-label": `Restore saved trial ${index + 1}, ${trial.time.toFixed(3)} seconds${trial.time === bestTime ? ", best saved trial" : ""}`,
    });
    const title = svgElement("title");
    title.textContent = `Trial ${index + 1}: ${trial.time.toFixed(3)} s`;
    dot.append(title);
    elements.historyPlot.append(dot);
  });

  if (savedTrials.length === 0) {
    elements.historySummary.textContent = "No saved trials yet";
  } else {
    elements.historySummary.textContent = `${savedTrials.length} saved · best ${bestTime.toFixed(3)} s`;
  }

  updateTrialActions();
}

function updateTrialActions() {
  const newTrialCount = savedTrials.filter((trial) => !trial.submitted).length;
  elements.clearTrialsButton.disabled = savedTrials.length === 0;
  elements.submitClassButton.disabled = newTrialCount === 0;
  elements.submitClassButton.textContent =
    newTrialCount === 0
      ? "No new saved trials"
      : `Add ${newTrialCount} new trial${newTrialCount === 1 ? "" : "s"} to class`;
}

function drawClassHistogram() {
  elements.classHistogramPlot.replaceChildren();
  const times = currentClassTimes();
  const endpoint = Number(elements.drop.value).toFixed(1);

  if (times.length === 0) {
    const message = svgElement("text", {
      x: 450,
      y: 112,
      class: "histogram-empty",
    });
    message.textContent = `No submissions yet for vertical drop ${endpoint} m`;
    elements.classHistogramPlot.append(message);
    elements.classSummary.textContent = `0 submissions · drop ${endpoint} m`;
    return;
  }

  const domainValues = [...times];
  if (elements.showCycloid.checked) domainValues.push(model.cycloidTime);
  let minimum = Math.min(...domainValues);
  let maximum = Math.max(...domainValues);
  const spread = maximum - minimum;
  const padding = Math.max(spread * 0.12, 0.08);
  minimum = Math.max(0, minimum - padding);
  maximum += padding;

  const binCount = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(times.length))));
  const binWidth = (maximum - minimum) / binCount;
  const counts = Array(binCount).fill(0);
  times.forEach((time) => {
    const index = Math.min(binCount - 1, Math.max(0, Math.floor((time - minimum) / binWidth)));
    counts[index] += 1;
  });

  const left = 72;
  const right = 848;
  const top = 28;
  const bottom = 172;
  const chartWidth = right - left;
  const chartHeight = bottom - top;
  const maximumCount = Math.max(...counts);
  const xForTime = (time) => left + ((time - minimum) / (maximum - minimum)) * chartWidth;

  elements.classHistogramPlot.append(
    svgElement("line", { x1: left, x2: right, y1: bottom, y2: bottom, class: "history-axis" }),
  );

  counts.forEach((count, index) => {
    const gap = 4;
    const width = chartWidth / binCount - gap;
    const height = count === 0 ? 0 : (count / maximumCount) * (chartHeight - 20);
    const x = left + (chartWidth * index) / binCount + gap / 2;
    const y = bottom - height;
    const bar = svgElement("rect", {
      x,
      y,
      width,
      height,
      rx: 5,
      class: "histogram-bar",
    });
    elements.classHistogramPlot.append(bar);

    if (count > 0) {
      const label = svgElement("text", {
        x: x + width / 2,
        y: y - 7,
        class: "histogram-count",
      });
      label.textContent = String(count);
      elements.classHistogramPlot.append(label);
    }
  });

  for (let index = 0; index <= 4; index += 1) {
    const time = minimum + ((maximum - minimum) * index) / 4;
    const x = xForTime(time);
    const tick = svgElement("line", {
      x1: x,
      x2: x,
      y1: bottom - 5,
      y2: bottom + 6,
      class: "history-tick",
    });
    const label = svgElement("text", { x, y: 201, class: "history-tick-label" });
    label.textContent = `${time.toFixed(2)} s`;
    elements.classHistogramPlot.append(tick, label);
  }

  if (elements.showCycloid.checked) {
    const x = xForTime(model.cycloidTime);
    const line = svgElement("line", {
      x1: x,
      x2: x,
      y1: top,
      y2: bottom,
      class: "history-cycloid-line",
    });
    const label = svgElement("text", { x: x + 7, y: top + 2, class: "history-cycloid-label" });
    label.textContent = "Cycloid";
    elements.classHistogramPlot.append(line, label);
  }

  const best = Math.min(...times);
  elements.classSummary.textContent = `${times.length} submission${times.length === 1 ? "" : "s"} · best ${best.toFixed(3)} s`;
}

function render() {
  cancelAnimationFrame(animationFrame);
  model = calculateModel(HORIZONTAL_DISTANCE, Number(elements.drop.value));
  const showCycloid = elements.showCycloid.checked;

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
  drawSavedCurves();
  drawControlPoints();
  drawHistory();
  drawClassHistogram();

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

function saveTrial() {
  savedTrials.push({
    id: newSubmissionId(),
    controlPoints: structuredClone(controlPoints),
    samples: structuredClone(model.customSamples),
    time: model.customTiming.totalTime,
    color: TRIAL_COLORS[savedTrials.length % TRIAL_COLORS.length],
    submitted: false,
  });
  render();
  elements.raceStatus.textContent = `Trial ${savedTrials.length} saved`;
}

function restoreTrial(index) {
  const trial = savedTrials[index];
  if (!trial) return;
  controlPoints = structuredClone(trial.controlPoints);
  render();
  elements.raceStatus.textContent = `Trial ${index + 1} restored`;
}

function clearSavedTrials() {
  const clearedCount = savedTrials.length;
  savedTrials = [];
  render();
  elements.raceStatus.textContent =
    clearedCount === 0 ? "No saved trials to clear" : `${clearedCount} saved trial${clearedCount === 1 ? "" : "s"} cleared`;
}

async function submitClassTimes() {
  const newTrials = savedTrials.filter((trial) => !trial.submitted);
  if (newTrials.length === 0) {
    elements.raceStatus.textContent = "No new saved trials to add";
    return;
  }

  const key = currentEndpointKey();
  try {
    if (USING_SHARED_API) {
      const response = await fetch(classApiEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verticalDrop: Number(key),
          submissions: newTrials.map((trial) => ({ id: trial.id, time: trial.time })),
        }),
      });
      if (!response.ok) throw new Error(`Class API returned ${response.status}`);
      await refreshClassResults();
    } else {
      const times = currentClassTimes();
      classResults[key] = [...times, ...newTrials.map((trial) => trial.time)];
      saveClassResults();
      drawClassHistogram();
    }

    newTrials.forEach((trial) => {
      trial.submitted = true;
    });
    updateTrialActions();
    elements.raceStatus.textContent = `${newTrials.length} new trial${newTrials.length === 1 ? "" : "s"} added to class histogram`;
  } catch (error) {
    console.error(error);
    elements.raceStatus.textContent = "Could not reach the shared class histogram";
  }
}

async function resetClassHistogram() {
  try {
    if (USING_SHARED_API) {
      const teacherToken = window.prompt("Teacher reset passphrase");
      if (teacherToken === null) return;
      const response = await fetch(classApiEndpoint(), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      if (!response.ok) {
        elements.raceStatus.textContent =
          response.status === 401 ? "Teacher passphrase not accepted" : "Could not reset histogram";
        return;
      }
      await refreshClassResults();
    } else {
      delete classResults[currentEndpointKey()];
      saveClassResults();
      drawClassHistogram();
    }
    elements.raceStatus.textContent = "Class histogram reset for this endpoint";
  } catch (error) {
    console.error(error);
    elements.raceStatus.textContent = "Could not reach the shared class histogram";
  }
}

function historyTrialIndex(event) {
  const dot = event.target.closest(".history-saved-dot");
  return dot ? Number(dot.dataset.index) : null;
}

elements.drop.addEventListener("input", () => {
  savedTrials = [];
  render();
  elements.raceStatus.textContent = "New endpoint — trial history cleared";
});
elements.drop.addEventListener("change", refreshClassResults);
elements.showCycloid.addEventListener("change", render);
elements.saveButton.addEventListener("click", saveTrial);
elements.clearTrialsButton.addEventListener("click", clearSavedTrials);
elements.submitClassButton.addEventListener("click", submitClassTimes);
elements.resetClassButton.addEventListener("click", resetClassHistogram);
elements.raceButton.addEventListener("click", runRace);
elements.resetButton.addEventListener("click", resetCurve);
elements.historyPlot.addEventListener("click", (event) => {
  const index = historyTrialIndex(event);
  if (index !== null) restoreTrial(index);
});
elements.historyPlot.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const index = historyTrialIndex(event);
  if (index === null) return;
  event.preventDefault();
  restoreTrial(index);
});

drawGrid();
elements.resetClassButton.toggleAttribute("hidden", !teacherMode);
if (USING_SHARED_API) {
  elements.classModeLabel.textContent = "Shared class session";
  elements.classStorageNote.textContent = `Shared through Cloudflare for session ${CLASS_SESSION_NAME}. Teacher reset is available in teacher mode.`;
}
render();
refreshClassResults();
