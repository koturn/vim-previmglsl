/**
 * Class for calling functions at regular intervals.
 */
class Animator {
  /**
   * High resolution timestamp when animation is started,
   * which the timestamp represents the time elapsed since Performance.timeOrigin (in milliseconds).
   * @type {number}
   */
  #startTime;
  /**
   * High resolution timestamp when animation is stopped,
   * which the timestamp represents the time elapsed since Performance.timeOrigin (in milliseconds).
   * @type {number}
   */
  #stopTime;
  /**
   * High resolution timestamp for total elapsed time (in milliseconds).
   * @type {number}
   */
  #totalElapsedTime;
  /**
   * Elapsed time per one frame.
   * @type {number}
   */
  #timePerFrame;
  /**
   * Smoothed elapsed time per one frame.
   * @type {number}
   */
  #smoothedTimePerFrame;
  /**
   * Frame counter.
   * @type {number}
   */
  #frameCount;
  /**
   * Stop animation function.
   * @type {function}
   */
  #stop;

  /**
   * Initialize all members.
   */
  constructor() {
    this.#startTime = 0.0;
    this.#stopTime = 0.0;
    this.#timePerFrame = 0.0;
    this.#totalElapsedTime = 0.0;
    this.#smoothedTimePerFrame = 0.0;
    this.#frameCount = 0;
    this.#stop = null;
  }

  /**
   * Start to call specified function cycly.
   * @param {function} Target function.
   * @param {number | undefined}  Interval (milliseconds) to call the function. If null, use requestAnimation().
   */
  start(f, interval, smoothingSize) {
    this.stop();

    if (typeof smoothingSize === 'undefined') {
      smoothingSize = 60;
    } else {
      smoothingSize = Math.floor(smoothingSize);
      if (smoothingSize < 1) {
        throw new Error("smoothingSize must be greater or equal to 1");
      }
    }

    this.#startTime = performance.now();
    this.#stopTime = this.#startTime;
    let prevTime = this.#startTime;

    let count = 0;
    let index = 0;
    let sum = 0;
    const dataArray = new Float64Array(smoothingSize);
    const updateSmoothedTimePerFrame = value => {
      index++;
      if (count < dataArray.length) {
        dataArray[index] = value;
        sum += value;
        count++;
      } else {
        if (index >= dataArray.length) {
          index -= dataArray.length;
        }
        const oldValue = dataArray[index];
        dataArray[index] = value;
        sum += value - oldValue;
      }
      return count === 0 ? 0 : sum / count;
    };

    f(prevTime, 0.0, 0.0);
    this.#frameCount++;
    if (typeof interval === 'undefined') {
      let loop = now => {
        this.#timePerFrame = now - prevTime;
        prevTime = now;

        this.#smoothedTimePerFrame = updateSmoothedTimePerFrame(this.#timePerFrame);

        f(now, this.#timePerFrame, this.#smoothedTimePerFrame);
        this.#frameCount++;

        id = requestAnimationFrame(loop);
      };
      let id = requestAnimationFrame(loop);
      this.#stop = () => cancelAnimationFrame(id);
    } else {
      let id = setInterval(() => {
        let now = performance.now();

        this.#timePerFrame = now - prevTime;
        prevTime = now;

        this.#smoothedTimePerFrame = updateSmoothedTimePerFrame(this.#timePerFrame);

        f(now, this.#timePerFrame, this.#smoothedTimePerFrame);
        this.#frameCount++;
      }, interval);
      this.#stop = () => clearInterval(id);
    }

    return this.#startTime;
  }

  /**
   * Start to call the function.
   */
  stop() {
    if (this.isStopped) {
      return;
    }
    this.#stop();
    this.#stop = null;
    this.#timePerFrame = 0.0;
    this.#smoothedTimePerFrame = 0.0;
    this.#stopTime = performance.now();
    this.#totalElapsedTime += this.#stopTime - this.#startTime;
  }

  /**
   * Reset #startTime, #stopTime and #totalElapsedTime.
   */
  reset() {
    const now = performance.now();
    this.#startTime = now;
    this.#stopTime = now;
    this.#totalElapsedTime = 0.0;
    this.#frameCount = 0;
  }

  /**
   * Elapsed time from start of animation (in milliseconds).
   * @type {number}
   */
  get startTime() {
    return this.#startTime;
  }

  /**
   * Get elapsed time from the start of animation (in milliseconds).
   * @type {number}
   */
  get elapsedFromStart() {
    return (this.isStopped ? this.#stopTime : performance.now()) - this.#startTime;
  }

  /**
   * Get total elapsed time which animation is worked (in milliseconds).
   * @type {number}
   */
  get totalElapsedTime() {
    return this.#totalElapsedTime + (this.isStopped ? 0.0 : performance.now() - this.#startTime);
  }

  /**
   * Get elapsed time per one frame (in milliseconds).
   * @type {number}
   */
  get timePerFrame() {
    return this.#timePerFrame;
  }

  /**
   * Get smoothed elapsed time per one frame (in milliseconds).
   * @type {number}
   */
  get smoothedTimePerFrame() {
    return this.#smoothedTimePerFrame;
  }

  /**
   * Get framerate.
   * @type {number}
   */
  get fps() {
    return (this.isStopped || this.#timePerFrame === 0) ? 0.0 : 1000.0 / this.#timePerFrame;
  }

  /**
   * Get smoothed framerate.
   * @type {number}
   */
  get smoothedFps() {
    return (this.isStopped || this.#smoothedTimePerFrame === 0) ? 0.0 : 1000.0 / this.#smoothedTimePerFrame;
  }

  /**
   * Get frame count.
   * @type {number}
   */
  get frameCount() {
    return this.#frameCount;
  }

  /**
   * Get this animator is stopped.
   * @type {boolean}
   */
  get isStopped() {
    return this.#stop === null;
  }
}
