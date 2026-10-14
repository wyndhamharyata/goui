// makeGraph draws one EQ graph into a host element and turns presses on it into band edits.
import { qStepRatio, responseDb, roundGainDb, setBandQ } from "../shared/bands.js";
import { drawLayerCurves, drawLoudness } from "./curves.js";
import { moveBand, setQFromPointer } from "./drag.js";
import { drawFrequencyGrid, drawGainGrid, drawRegions } from "./grid.js";
import { drawBandLabel, drawBandPoints, drawChosenBand, drawHover } from "./marks.js";
import { drawSpectrum } from "./spectrum.js";
import { curveStyle, offCurveStyle } from "./styles.js";
import { drawCurve, makeRect, makeSvg } from "./svg.js";
import { drawnGainDb, readPoint, sweepFrequencies } from "./view.js";

/** @typedef {import("../shared/bands.js").Band} Band */

/** @typedef {import("../shared/config.js").LayerBands} LayerBands */

/** @typedef {import("./view.js").View} View */

/** @typedef {import("./view.js").Point} Point */

/** @typedef {import("./drag.js").Drag} Drag */

/** @typedef {import("./marks.js").BandPoint} BandPoint */

// Where the last render drew each band point and Q handle, so a press can find what it is on.
/** @typedef {{ points: BandPoint[], qHandles: Point[] }} PressTargets */

/** @typedef {{ role: import("../shared/config.js").LayerRole, band: Band }} BandEntry */

/**
 * @typedef {object} GraphOptions
 * @property {number} height
 * @property {number} tallHeight
 * @property {boolean} interactive
 */

/**
 * @typedef {object} GraphHooks
 * @property {() => BandEntry[]} listBandEntries
 * @property {() => Band[]} listCurveBands
 * @property {() => LayerBands[]} listCurveLayers
 * @property {() => number[]} readSpectrumDb
 * @property {() => number} readSelectedIndex
 * @property {() => boolean} isEqOff
 * @property {(index: number) => void} selectBand
 * @property {() => void} commitBandEdit
 * @property {(frequencyHz: number, gainDb: number) => void} addBand
 */

/**
 * @typedef {object} Graph
 * @property {() => void} render
 * @property {() => void} renderSpectrum
 * @property {string} zoom
 * @property {boolean} isTall
 * @property {(zoom: string) => void} setZoom
 * @property {(isTall: boolean) => void} setTall
 */

// A graph that is not interactive draws no points and takes no input.
/**
 * @param {HTMLElement} host
 * @param {GraphOptions} options
 * @param {GraphHooks} hooks
 * @returns {Graph}
 */
export function makeGraph(host, options, hooks) {
  let zoom = "all";
  let isTall = false;
  /** @type {Point | null} */
  let hover = null;
  /** @type {Drag | null} */
  let drag = null;
  /** @type {PressTargets} */
  let pressTargets = { points: [], qHandles: [] };
  const clipId = `clip-${host.id}`;

  /** @returns {View} */
  function measureView() {
    const height = isTall ? options.tallHeight : options.height;
    const top = isTall ? 16 : 8;
    const bottom = isTall ? 6 : 16;
    const size = { width: host.clientWidth, height, left: 30, top, plotWidth: host.clientWidth - 38, plotHeight: height - top - bottom };
    return { zoom, isTall, size };
  }

  /**
   * @param {number} index
   * @returns {Band | undefined}
   */
  function bandAt(index) {
    const entry = hooks.listBandEntries()[index];
    return entry && entry.band;
  }

  /**
   * @param {View} view
   * @returns {SVGElement[]}
   */
  function drawHoverNow(view) {
    if (!hover || drag) return [];
    return drawHover(view, hover, hooks.listCurveBands());
  }

  // Replacing the whole SVG would remove the element under the pointer, and the browser would send no click.
  /**
   * @param {string} name
   * @param {(view: View) => SVGElement[]} draw
   */
  function renderGroup(name, draw) {
    const group = host.querySelector(`[data-${name}]`);
    if (group) group.replaceChildren(...draw(measureView()));
    else render();
  }

  function renderSpectrum() {
    renderGroup("spectrum", (view) => drawSpectrum(view, sweepFrequencies(view), hooks.readSpectrumDb()));
  }

  function renderHover() {
    renderGroup("hover", drawHoverNow);
  }

  // The plot clips the spectrum and the curves. The grid labels, the points and the hover box draw outside it.
  function render() {
    const view = measureView();
    const { size } = view;
    if (size.width === 0) return;
    const frequencies = sweepFrequencies(view);
    const curveDb = responseDb(hooks.listCurveBands(), frequencies);
    const chosenIndex = hooks.readSelectedIndex();
    const chosenBand = bandAt(chosenIndex);
    const showsChosenBand = options.interactive && Boolean(chosenBand);

    const chosen = showsChosenBand ? drawChosenBand(view, chosenBand, frequencies) : { elements: [], qHandles: [] };
    const bandPoints = options.interactive ? drawBandPoints(view, hooks.listBandEntries(), chosenIndex) : { elements: [], points: [] };
    pressTargets = { points: bandPoints.points, qHandles: chosen.qHandles };

    const plotBox = { x: size.left, y: size.top, width: size.plotWidth, height: size.plotHeight };
    const clipPath = makeSvg("clipPath", { id: clipId }, [makeRect(plotBox, {})]);
    const plot = makeSvg("g", { clipPath: `url(#${clipId})` }, [
      makeSvg("g", { dataSpectrum: "" }, drawSpectrum(view, frequencies, hooks.readSpectrumDb())),
      ...drawLoudness(view, frequencies, curveDb),
      ...chosen.elements,
      ...drawLayerCurves(view, frequencies, hooks.listCurveLayers()),
      drawCurve(view, frequencies, curveDb, hooks.isEqOff() ? offCurveStyle : curveStyle),
    ]);
    host.replaceChildren(makeSvg("svg", { viewBox: `0 0 ${size.width} ${size.height}`, height: size.height }, [
      makeSvg("defs", {}, [clipPath]),
      ...drawRegions(view),
      ...drawFrequencyGrid(view),
      ...drawGainGrid(view),
      plot,
      ...bandPoints.elements,
      ...(showsChosenBand ? drawBandLabel(view, chosenBand) : []),
      makeSvg("g", { dataHover: "" }, drawHoverNow(view)),
    ]));
  }

  /**
   * @param {MouseEvent} event
   * @returns {Point}
   */
  function readPointer(event) {
    const bounds = host.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  /**
   * @param {Point} pointer
   * @returns {{ kind: "q" | "move", index: number } | null}
   */
  function findTarget(pointer) {
    /**
     * @param {Point} item
     * @param {number} radiusPx
     * @returns {boolean}
     */
    const isNear = (item, radiusPx) => Math.hypot(item.x - pointer.x, item.y - pointer.y) < radiusPx;
    const handleRadiusPx = 12;
    const pointRadiusPx = 14;
    if (pressTargets.qHandles.some((handle) => isNear(handle, handleRadiusPx))) return { kind: "q", index: hooks.readSelectedIndex() };
    // The last point drawn is on top, so it wins a press on two points.
    const point = [...pressTargets.points].reverse().find((item) => isNear(item, pointRadiusPx));
    return point ? { kind: "move", index: point.index } : null;
  }

  /** @param {PointerEvent} event */
  function startDrag(event) {
    const pointer = readPointer(event);
    const target = findTarget(pointer);
    if (!target) return;
    const band = bandAt(target.index);
    drag = { ...target, startX: pointer.x, startY: pointer.y, startHz: band.frequencyHz, startDb: drawnGainDb(band) };
    host.setPointerCapture(event.pointerId);
    hooks.selectBand(target.index);
  }

  /** @param {PointerEvent} event */
  function followPointer(event) {
    const pointer = readPointer(event);
    hover = pointer;
    if (!drag) {
      renderHover();
      return;
    }
    // A press only selects. The point moves once the pointer has gone 5 px, counted from there.
    if (!drag.isMoving) {
      const deadZonePx = 5;
      if (Math.hypot(pointer.x - drag.startX, pointer.y - drag.startY) < deadZonePx) return;
      drag.isMoving = true;
      drag.startX = pointer.x;
      drag.startY = pointer.y;
    }
    const band = bandAt(drag.index);
    drag.isQuarterSpeed = event.shiftKey;
    if (drag.kind === "move") moveBand(measureView(), band, drag, pointer);
    else setQFromPointer(measureView(), band, pointer);
    hooks.commitBandEdit();
  }

  function endDrag() {
    const wasDragging = Boolean(drag);
    drag = null;
    // A full redraw would remove the pressed point, and the browser would send no click, so only the hover redraws.
    if (wasDragging) renderHover();
  }

  /** @param {MouseEvent} event */
  function addBandAtPointer(event) {
    const pointer = readPointer(event);
    if (findTarget(pointer)) return;
    const reading = readPoint(measureView(), pointer.x, pointer.y);
    hooks.addBand(Math.round(reading.frequencyHz), roundGainDb(reading.gainDb));
  }

  /** @param {WheelEvent} event */
  function stepQWithWheel(event) {
    const target = findTarget(readPointer(event));
    if (!target) return;
    event.preventDefault();
    const band = bandAt(target.index);
    setBandQ(band, band.q * (qStepRatio ** (event.deltaY < 0 ? 1 : -1)));
    hooks.selectBand(target.index);
    hooks.commitBandEdit();
  }

  if (options.interactive) {
    host.addEventListener("pointerdown", startDrag);
    host.addEventListener("pointermove", followPointer);
    host.addEventListener("pointerup", endDrag);
    host.addEventListener("pointerleave", () => {
      hover = null;
      if (!drag) renderHover();
    });
    host.addEventListener("dblclick", addBandAtPointer);
    host.addEventListener("wheel", stepQWithWheel, { passive: false });
  }

  new ResizeObserver(render).observe(host);

  return {
    render,
    renderSpectrum,
    get zoom() {
      return zoom;
    },
    get isTall() {
      return isTall;
    },
    setZoom(nextZoom) {
      zoom = nextZoom;
      render();
    },
    setTall(nextIsTall) {
      isTall = nextIsTall;
      render();
    },
  };
}
