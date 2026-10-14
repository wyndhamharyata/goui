// EqGraph draws one EQ graph into a host element and turns presses on it into band edits.
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

const handleRadiusPx = 12;
const pointRadiusPx = 14;
// A press only selects. The point moves once the pointer has gone this far, counted from there.
const deadZonePx = 5;

/**
 * @param {Point} item
 * @param {Point} pointer
 * @param {number} radiusPx
 * @returns {boolean}
 */
function isNear(item, pointer, radiusPx) {
  return Math.hypot(item.x - pointer.x, item.y - pointer.y) < radiusPx;
}

// A graph that is not interactive draws no points and takes no input.
export class EqGraph {
  zoom = "all";
  isTall = false;
  /** @type {Point | null} */
  #hover = null;
  /** @type {Drag | null} */
  #drag = null;
  /** @type {PressTargets} */
  #pressTargets = { points: [], qHandles: [] };
  #host;
  #options;
  #hooks;
  #clipId;

  /**
   * @param {HTMLElement} host
   * @param {GraphOptions} options
   * @param {GraphHooks} hooks
   */
  constructor(host, options, hooks) {
    this.#host = host;
    this.#options = options;
    this.#hooks = hooks;
    this.#clipId = `clip-${host.id}`;

    if (options.interactive) {
      host.addEventListener("pointerdown", (event) => this.#startDrag(event));
      host.addEventListener("pointermove", (event) => this.#followPointer(event));
      host.addEventListener("pointerup", () => this.#endDrag());
      host.addEventListener("pointerleave", () => this.#leave());
      host.addEventListener("dblclick", (event) => this.#addBandAtPointer(event));
      host.addEventListener("wheel", (event) => this.#stepQWithWheel(event), { passive: false });
    }

    new ResizeObserver(() => this.render()).observe(host);
  }

  /** @param {string} zoom */
  setZoom(zoom) {
    this.zoom = zoom;
    this.render();
  }

  /** @param {boolean} isTall */
  setTall(isTall) {
    this.isTall = isTall;
    this.render();
  }

  renderSpectrum() {
    this.#renderGroup("spectrum", (view) => drawSpectrum(view, sweepFrequencies(view), this.#hooks.readSpectrumDb()));
  }

  // The plot clips the spectrum and the curves. The grid labels, the points and the hover box draw outside it.
  render() {
    const view = this.#measureView();
    const { size } = view;
    if (size.width === 0) return;

    const frequencies = sweepFrequencies(view);
    const curveDb = responseDb(this.#hooks.listCurveBands(), frequencies);
    const chosenIndex = this.#hooks.readSelectedIndex();
    const chosenBand = this.#bandAt(chosenIndex);
    const showsChosenBand = this.#options.interactive && Boolean(chosenBand);

    const chosen = showsChosenBand ? drawChosenBand(view, chosenBand, frequencies) : { elements: [], qHandles: [] };
    const bandPoints = this.#options.interactive ? drawBandPoints(view, this.#hooks.listBandEntries(), chosenIndex) : { elements: [], points: [] };
    this.#pressTargets = { points: bandPoints.points, qHandles: chosen.qHandles };

    const plotBox = { x: size.left, y: size.top, width: size.plotWidth, height: size.plotHeight };
    const clipPath = makeSvg("clipPath", { id: this.#clipId }, [makeRect(plotBox, {})]);
    const plot = makeSvg("g", { clipPath: `url(#${this.#clipId})` }, [
      makeSvg("g", { dataSpectrum: "" }, drawSpectrum(view, frequencies, this.#hooks.readSpectrumDb())),
      ...drawLoudness(view, frequencies, curveDb),
      ...chosen.elements,
      ...drawLayerCurves(view, frequencies, this.#hooks.listCurveLayers()),
      drawCurve(view, frequencies, curveDb, this.#hooks.isEqOff() ? offCurveStyle : curveStyle),
    ]);
    this.#host.replaceChildren(makeSvg("svg", { viewBox: `0 0 ${size.width} ${size.height}`, height: size.height }, [
      makeSvg("defs", {}, [clipPath]),
      ...drawRegions(view),
      ...drawFrequencyGrid(view),
      ...drawGainGrid(view),
      plot,
      ...bandPoints.elements,
      ...(showsChosenBand ? drawBandLabel(view, chosenBand) : []),
      makeSvg("g", { dataHover: "" }, this.#drawHoverNow(view)),
    ]));
  }

  /** @returns {View} */
  #measureView() {
    const height = this.isTall ? this.#options.tallHeight : this.#options.height;
    const top = this.isTall ? 16 : 8;
    const bottom = this.isTall ? 6 : 16;
    const width = this.#host.clientWidth;
    const size = { width, height, left: 30, top, plotWidth: width - 38, plotHeight: height - top - bottom };

    return { zoom: this.zoom, isTall: this.isTall, size };
  }

  /**
   * @param {number} index
   * @returns {Band | undefined}
   */
  #bandAt(index) {
    const entry = this.#hooks.listBandEntries()[index];
    return entry && entry.band;
  }

  /**
   * @param {View} view
   * @returns {SVGElement[]}
   */
  #drawHoverNow(view) {
    if (!this.#hover || this.#drag) return [];

    return drawHover(view, this.#hover, this.#hooks.listCurveBands());
  }

  // Replacing the whole SVG would remove the element under the pointer, and the browser would send no click.
  /**
   * @param {string} name
   * @param {(view: View) => SVGElement[]} draw
   */
  #renderGroup(name, draw) {
    const group = this.#host.querySelector(`[data-${name}]`);
    if (group) group.replaceChildren(...draw(this.#measureView()));
    else this.render();
  }

  #renderHover() {
    this.#renderGroup("hover", (view) => this.#drawHoverNow(view));
  }

  /**
   * @param {MouseEvent} event
   * @returns {Point}
   */
  #readPointer(event) {
    const bounds = this.#host.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  /**
   * @param {Point} pointer
   * @returns {{ kind: "q" | "move", index: number } | null}
   */
  #findTarget(pointer) {
    const isOnQHandle = this.#pressTargets.qHandles.some((handle) => isNear(handle, pointer, handleRadiusPx));
    if (isOnQHandle) return { kind: "q", index: this.#hooks.readSelectedIndex() };

    // The last point drawn is on top, so it wins a press on two points.
    const point = [...this.#pressTargets.points].reverse().find((item) => isNear(item, pointer, pointRadiusPx));

    return point ? { kind: "move", index: point.index } : null;
  }

  #startDrag(event) {
    const pointer = this.#readPointer(event);
    const target = this.#findTarget(pointer);
    if (!target) return;

    const band = this.#bandAt(target.index);
    this.#drag = { ...target, startX: pointer.x, startY: pointer.y, startHz: band.frequencyHz, startDb: drawnGainDb(band) };

    this.#host.setPointerCapture(event.pointerId);
    this.#hooks.selectBand(target.index);
  }

  #followPointer(event) {
    const pointer = this.#readPointer(event);
    this.#hover = pointer;
    const drag = this.#drag;
    if (!drag) {
      this.#renderHover();
      return;
    }

    if (!drag.isMoving) {
      if (Math.hypot(pointer.x - drag.startX, pointer.y - drag.startY) < deadZonePx) return;

      drag.isMoving = true;
      drag.startX = pointer.x;
      drag.startY = pointer.y;
    }

    const band = this.#bandAt(drag.index);
    drag.isQuarterSpeed = event.shiftKey;
    if (drag.kind === "move") moveBand(this.#measureView(), band, drag, pointer);
    else setQFromPointer(this.#measureView(), band, pointer);
    this.#hooks.commitBandEdit();
  }

  #endDrag() {
    const wasDragging = Boolean(this.#drag);
    this.#drag = null;
    // A full redraw would remove the pressed point, and the browser would send no click, so only the hover redraws.
    if (wasDragging) this.#renderHover();
  }

  #leave() {
    this.#hover = null;
    if (!this.#drag) this.#renderHover();
  }

  #addBandAtPointer(event) {
    const pointer = this.#readPointer(event);
    if (this.#findTarget(pointer)) return;

    const reading = readPoint(this.#measureView(), pointer.x, pointer.y);
    this.#hooks.addBand(Math.round(reading.frequencyHz), roundGainDb(reading.gainDb));
  }

  #stepQWithWheel(event) {
    const target = this.#findTarget(this.#readPointer(event));
    if (!target) return;

    event.preventDefault();
    const band = this.#bandAt(target.index);
    setBandQ(band, band.q * (qStepRatio ** (event.deltaY < 0 ? 1 : -1)));
    this.#hooks.selectBand(target.index);
    this.#hooks.commitBandEdit();
  }
}
