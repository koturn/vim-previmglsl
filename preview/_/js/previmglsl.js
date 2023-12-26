;(function(global, undefined) {
  'use strict';

  /**
   * Cache of window.document.
   * @type {Document}
   */
  const doc = global.document;
  /**
   * GLSL renderer.
   * @type {GlslQuadRenderer}
   */
  let renderer = null;
  /**
   * Header area.
   * @type {HTMLHeaderElement}
   */
  let headerArea;
  /**
   * Footer area.
   * @type {HTMLFooterElement}
   */
  let footerArea;
  /**
   * Canvas.
   * @type {HTMLCanvasElement}
   */
  let canvas;
  /**
   * Elapsed time value area.
   * @type {HTMLDivElement}
   */
  let elapsedTimeElement;
  /**
   * Framerate area.
   * @type {HTMLDivElement}
   */
  let fpsElement;
  /**
   * Frametime value area.
   * @type {HTMLDivElement}
   */
  let frametimeElement;
  /**
   * Frametime area.
   * @type {HTMLSpanElement}
   */
  let frametimeAreaElement;
  /**
   * Checkbox to switch VSync.
   * @type {HTMLInputElement}
   */
  let vsyncCheckBox;
  /**
   * Target FPS label.
   * @type {HTMLSpanElement}
   */
  let targetFpsLabel;
  /**
   * Target FPS input.
   * @type {HTMLInputElement}
   */
  let targetFps;
  /**
   * Comiler messages area.
   * @type {HTMLPreElement}
   */
  let compilerMessagesElement;
  /**
   * Mouse move offset of X.
   * @type {number}
   */
  let mx = 0.0;
  /**
   * Mouse move offset of Y.
   * @type {number}
   */
  let my = 0.0;
  /**
   * Scale of canvas.
   * @type {number}
   */
  let scale = 1.0;
  /**
   * Animator.
   * @type {Animator}
   */
  let animator = new Animator();

  window.addEventListener('load', () => {
    headerArea = doc.getElementById('header');
    footerArea = doc.getElementById('footer');
    canvas = doc.getElementById('canvas');
    canvas.addEventListener('mousemove', e => {
      mx = e.offsetX / canvas.width;
      my = e.offsetY / canvas.height;
    }, true);
    canvas.addEventListener('click', () => {
      if (animator.isStopped) {
        start();
      } else {
        stop();
        render();
      }
    }, true);

    const scaleSelect = doc.getElementById('scale');
    scale = parseFloat(scaleSelect.value);
    scaleSelect.addEventListener('change', e => {
      const target = e.target;
      if (clampNumberInput(target)) {
        return;
      }
      scale = target.value;
      render();
    }, true);

    targetFpsLabel = doc.getElementById('target-fps-label');
    targetFps = doc.getElementById('target-fps');
    targetFps.addEventListener('change', e => {
      if (clampNumberInput(e.target)) {
        return;
      }
      if (!animator.isStopped) {
        start();
      }
    });

    vsyncCheckBox = doc.getElementById('vsync-checkbox');
    vsyncCheckBox.addEventListener('change', e => {
      const target = e.target;

      if (target.checked) {
        targetFpsLabel.style.color = "#000000";
        targetFps.disabled = true;
      } else {
        targetFpsLabel.style.color = "#808080";
        targetFps.disabled = false;
      }

      if (!animator.isStopped) {
        start();
      }
    }, true);

    const frametimeCheckBox = doc.getElementById('frametime-checkbox');
    frametimeCheckBox.addEventListener('change', e => {
      if (e.target.checked) {
        renderer.enableMeasureFrametime();
        frametimeAreaElement.style.display = '';
      } else {
        renderer.disableMeasureFrametime();
        frametimeAreaElement.style.display = 'none';
      }
    }, true);

    global.addEventListener('resize', () => {
      render();
    }, true);
    elapsedTimeElement = doc.getElementById('elapsed-time');
    fpsElement = doc.getElementById('fps');
    frametimeElement = doc.getElementById('frametime');
    frametimeAreaElement = doc.getElementById('frametime-area');
    compilerMessagesElement = doc.getElementById('compiler-messages');
    loadContentScript();
    global.setInterval(loadContentScript, 1000);
  });

  /**
   * Clamp value of number input.
   * @param {HTMLInputElement} numberInput Number input element.
   * @param {number} min Minimum value for numberInput. (optional)
   * @param {number} max maximum value for numberInput. (optional)
   * @return True if value of number input is clamped, otherwise false.
   */
  function clampNumberInput(numberInput, min, max) {
    if (typeof min === 'undefined') {
      min = Number.parseFloat(numberInput.min);
    }
    if (typeof max === 'undefined') {
      max = Number.parseFloat(numberInput.max);
    }

    const value = Number.parseFloat(numberInput.value);
    if (value < min) {
      // Fire change event.
      numberInput.value = min;
      return true;
    } else if (value > max) {
      // Fire change event.
      numberInput.value = max;
      return true;
    } else {
      return false;
    }
  }

  /**
   * Start animation.
   */
  function start() {
    if (vsyncCheckBox.checked) {
      console.log('Start animation: VSync');
      animator.start(render);
    } else {
      const interval = 1000.0 / parseFloat(targetFps.value);
      console.log('Start animation: Interval: ' + interval + ' msec');
      animator.start(render, interval);
    }
  }

  /**
   * Stop animation.
   */
  function stop() {
    animator.stop();
  }

  /**
   * Render created GLSL program.
   */
  function render(now, t, st) {
    const time = animator.totalElapsedTime * 0.001;
    elapsedTimeElement.innerText = time.toFixed(3);

    const w = global.innerWidth / scale;
    const h = Math.max(0, global.innerHeight - headerArea.offsetHeight - footerArea.offsetHeight) / scale;

    canvas.width = w;
    canvas.height = h;

    renderer.setUniforms(time, mx, my, w, h);
    renderer.render(w, h);

    if (frametimeElement !== null) {
      frametimeElement.innerText = (renderer.getFrameTime() / 1000000.0).toFixed(3);
    }
  }

  /**
   * Determine if reloading is necessary, and if so, rebuild the program and reload.
   */
  async function loadPreview() {
    let needReload = false;
    // These functions are defined as the file generated dynamically.
    //   generator-file: preview/autoload/previm.vim
    //   generated-file: preview/js/previm-function.js
    if (typeof getFileName !== 'function') {
      needReload = true;
    } else if (doc.getElementById('file-name').innerHTML !== getFileName()) {
      doc.getElementById('file-name').innerHTML = getFileName();
      needReload = true;
    }
    if (typeof getLastModified !== 'function') {
      needReload = true;
    } else if (doc.getElementById('last-modified').innerHTML !== getLastModified()) {
      doc.getElementById('last-modified').innerHTML = getLastModified();
      needReload = true;
    }

    if (needReload && (typeof getContent === 'function') && (typeof getFileType === 'function')) {
      const fsText = getContent();
      try {
        const isFirstBuild = renderer === null;
        if (renderer === null) {
          if (getFileType() === 'glsl') {
            renderer = new GlslQuadRenderer(canvas);
          } else {
            renderer = await WgslQuadRenderer.create(canvas);
          }
          if (!renderer.enableMeasureFrametime()) {
            frametimeElement.remove();
            frametimeElement = null;
            frametimeAreaElement.remove();
            frametimeAreaElement = null;
            doc.getElementById('frametime-area').remove();
            doc.getElementById('frametime-checkbox').remove();
            doc.getElementById('frametime-checkbox-label').remove();
          }
        }

        const isStopped = animator.isStopped;
        animator.stop();

        measureTime(
          () => renderer.build(fsText),
          elapsed => console.log('Build success: ' + new Date() + ', elapsed: ' + elapsed.toFixed(3) + ' msec'),
          elapsed => console.error('Build failed: ' + new Date() + ', elapsed: ' + elapsed.toFixed(3) + ' msec'));

        if (isFirstBuild || !isStopped) {
          start();
        } else {
          render();
        }

        canvas.style.display = '';
        compilerMessagesElement.innerText = '';
      } catch (e) {
        console.error(e);
        canvas.style.display = 'none';
        compilerMessagesElement.innerText = e.message;
      }
    }

    return 0;
  }

  /**
   * Load javascript by creating script element.
   */
  function loadContentScript() {
    const script = doc.createElement('script');
    script.type = 'text/javascript';
    script.src = 'js/content.js?t=' + new Date().getTime();
    script.addEventListener('load', async () => {
      await loadPreview();
      global.setTimeout(() => script.parentNode.removeChild(script), 160);
    });
    doc.getElementsByTagName('head')[0].appendChild(script);
    fpsElement.innerText = animator.smoothedFps.toFixed(2);
  }

  /**
   * Measure time.
   * @param {function} f Measure target action.
   * @param {function(number)} onSuccess Callback function on success.
   * @param {function(number)} onFailure Callback function on failure.
   */
  function measureTime(f, onSuccess, onFailure) {
    const startTime = performance.now();
    try {
      f();
      const t1 = performance.now();
      onSuccess(performance.now() - startTime);
    } catch (e) {
      onFailure(performance.now() - startTime);
      throw e;
    }
  }
})((this || 0).self || global);
