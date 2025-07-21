;(function(global, undefined) {
  'use strict';

  /**
   * Cache of window.document.
   * @type {Document}
   */
  const doc = global.document;
  /**
   * Class definition of Animator.
   */
  const Animator = global.Animator.noConflict();
  /**
   * Class definition of Twigl.
   */
  const Twigl = global.Twigl.noConflict();
  /**
   * Class definition of GlslQuadRenderer.
   */
  const GlslQuadRenderer = global.GlslQuadRenderer.noConflict();
  /**
   * Class definition of WgslQuadRenderer.
   */
  const WgslQuadRenderer = global.WgslQuadRenderer.noConflict();
  /**
   * Animator.
   * @type {Animator}
   */
  const animator = new Animator();
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
   * Icon button to stop playing.
   * @type {SVGElement}
   */
  let buttonStop;
  /**
   * Icon button to start playing.
   * @type {SVGElement}
   */
  let buttonStart;
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
   * @type {HTMLTextAreaElement}
   */
  let compilerMessagesTextArea;
  /**
   * <span> to show tabs.
   * @type {HTMLSpanElement}
   */
  let tabAreaSpan;
  /**
   * <textarea> to show translated vertex shader source.
   * @type {HTMLTextAreaElement}
   */
  let transVertTextArea;
  /**
   * <textarea> to show translated fragment shader source.
   * @type {HTMLTextAreaElement}
   */
  let transFragTextArea;
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

  global.addEventListener('load', () => {
    headerArea = doc.getElementById('header');
    footerArea = doc.getElementById('footer');
    canvas = doc.getElementById('canvas');
    canvas.addEventListener('mousemove', e => {
      mx = e.offsetX / (canvas.width * scale);
      my = (1.0 - e.offsetY / (canvas.height * scale));
    }, true);

    const scaleSelect = doc.getElementById('scale');
    scale = Number.parseFloat(scaleSelect.value);
    scaleSelect.addEventListener('change', e => {
      const target = e.target;
      if (clampNumberInput(target)) {
        return;
      }
      scale = target.value;
      resizeContent();
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
      resizeContent();
    }, true);

    global.addEventListener('resize', resizeContent, true);
    elapsedTimeElement = doc.getElementById('elapsed-time');
    fpsElement = doc.getElementById('fps');
    frametimeElement = doc.getElementById('frametime');
    frametimeAreaElement = doc.getElementById('frametime-area');
    compilerMessagesTextArea = doc.getElementById('compiler-messages');

    tabAreaSpan = doc.getElementById('tab-area');

    transVertTextArea = doc.getElementById('trans-vert');
    const transVertRadioButton = doc.getElementById('tab-trans-vert');
    if (transVertRadioButton !== null) {
      transVertRadioButton.addEventListener('change', e => {
        if (e.target.checked && transVertTextArea.innerText === '') {
          transVertTextArea.value = renderer.translatedVertexShaderSource;
        }
      }, true);
    }

    transFragTextArea = doc.getElementById('trans-frag');
    const transFragRadioButton = doc.getElementById('tab-trans-frag');
    if (transFragRadioButton !== null) {
      transFragRadioButton.addEventListener('change', e => {
        if (e.target.checked && transFragTextArea.innerText === '') {
          transFragTextArea.value = renderer.translatedFragmentShaderSource;
        }
      }, true);
    }

    doc.addEventListener('keydown', e => {
      if (e.defaultPrevented) {
        return;
      }

      console.log(e);

      let isTogglePlayingPressed = false;
      let isAltEnterPressed = false;
      let isCtrlSPressed = false;
      if (typeof e.key !== 'undefined') {
        isTogglePlayingPressed = e.key === ' ' || e.key === 'k';
        isAltEnterPressed = e.key === 'Enter' && e.altKey;
        isCtrlSPressed = e.key === 's' && e.ctrlKey;
      } else if (typeof e.keyIdentifier !== 'undefined') {
        isTogglePlayingPressed = e.keyIdentifier === ' ' || e.keyIdentifier === 'k';
        isAltEnterPressed = e.keyIdentifier === 'Enter' && e.altKey;
        isCtrlSPressed = e.keyIdentifier === 's' && e.ctrlKey;
      } else if (typeof e.keyCode !== 'undefined') {
        isTogglePlayingPressed = e.keyCode === 0x20 || e.keyCode === 0x4b;
        isAltEnterPressed = e.keyCode === 0x0d && e.altKey;
        isCtrlSPressed = e.keyCode === 0x53 && e.ctrlKey;
      }

      if (isTogglePlayingPressed) {
        if (animator.isStopped) {
          start();
        } else {
          stop();
          render();
        }
      } else if (isAltEnterPressed) {
        toggleFullscreen();
      } else if (isCtrlSPressed) {
        downloadCanvas();
      }

      if (isAltEnterPressed || isCtrlSPressed) {
        e.preventDefault();
      };
    });

    buttonStop = doc.getElementById('button-stop');
    buttonStop.addEventListener('click', e => {
      stop();
      render();
    }, true);

    buttonStart = doc.getElementById('button-start');
    buttonStart.addEventListener('click', e => {
      start();
    }, true);

    doc.getElementById('button-download').addEventListener('click', e => {
      const selectedValue = doc.getElementById('select-download-type').value;
      const baseFileName = getFileName().replace(/.*[\/\\]/, '').replace(/\.[^.]*$/, '');
      switch (selectedValue) {
        case 'png':
          downloadCanvas(baseFileName + '.png');
          break;
        case 'jpeg':
          downloadCanvas(baseFileName + '.jpg');
          break;
        case 'webp':
          downloadCanvas(baseFileName + '.webp');
          break;
        case 'html':
          downloadSingleHtml(baseFileName + '.html');
          break;
        default:
          throw new Error('Unrecognized download type: ' + selectedValue);
      }
    });

    doc.getElementById('enter-fullscreen').addEventListener('click', e => toggleFullscreen());

    doc.addEventListener('fullscreenchange', e => {
      const displayValue = doc.fullscreenElement === null ? '' : 'none';
      tabAreaSpan.style.display = displayValue;
      headerArea.style.display = displayValue;
      footerArea.style.display = displayValue;
      resizeContent();
    });

    let interval;

    /**
     * Load javascript by creating script element.
     */
    function loadContentScript() {
      const script = doc.createElement('script');
      script.type = 'text/javascript';
      script.src = 'js/content.js?t=' + new Date().getTime();
      script.addEventListener('error', () => {
        if (typeof getOptions === 'function' && getOptions().autoClose) {
          global.open('about:blank', '_self').close();
        }
        if (typeof interval !== 'undefined') {
          global.clearInterval(interval);
        }
      });
      script.addEventListener('load', async () => {
        await loadPreview();
        global.setTimeout(() => script.parentNode.removeChild(script), 160);
      });
      doc.getElementsByTagName('head')[0].appendChild(script);
      fpsElement.innerText = animator.smoothedFps.toFixed(2);
    }
    loadContentScript();
    interval = global.setInterval(loadContentScript, 1000);
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
      const interval = 1000.0 / Number.parseFloat(targetFps.value);
      console.log('Start animation: Interval: ' + interval + ' msec');
      animator.start(render, interval);
    }
    buttonStop.style.display = '';
    buttonStart.style.display = 'none';
  }

  /**
   * Stop animation.
   */
  function stop() {
    animator.stop();
    buttonStop.style.display = 'none';
    buttonStart.style.display = '';
  }

  /**
   * Resize canvas.
   */
  function resizeContent() {
    const sw = global.innerWidth / scale;
    const h = Math.max(0, global.innerHeight - headerArea.offsetHeight - footerArea.offsetHeight - tabAreaSpan.offsetHeight);
    const sh = h / scale;

    canvas.width = sw;
    canvas.height = sh;
    compilerMessagesTextArea.style.height = Math.max(0, h - 8) + 'px';
    transVertTextArea.style.height = Math.max(0, h - 8) + 'px';
    transFragTextArea.style.height = Math.max(0, h - 8) + 'px';

    render();
  }

  /**
   * Render created GLSL program.
   */
  function render() {
    if (!renderer.hasBuilt) {
      return;
    }

    const time = animator.totalElapsedTime * 0.001;
    elapsedTimeElement.innerText = time.toFixed(3);

    const w = canvas.width;
    const h = canvas.height;

    renderer.setUniforms(time, mx, my, w, h);
    renderer.render(w, h);

    if (frametimeElement !== null) {
      frametimeElement.innerText = (renderer.frametime / 1000000.0).toFixed(3);
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
      const target = typeof getTarget === 'function' ? getTarget() : 'auto';
      const fsSource = preprocess(getContent(), target);
      const uniformDict = getUniformDict(target);
      try {
        const isFirstBuild = renderer === null;
        if (renderer === null) {
          if (getFileType() === 'glsl') {
            renderer = new GlslQuadRenderer(canvas);
            renderer.useBackBuffer = true;
            doc.title = 'GLSL Preview';
          } else {
            renderer = await WgslQuadRenderer.create(canvas);
            doc.title = 'WLSL Preview';
          }
          if (!renderer.enableMeasureFrametime()) {
            frametimeElement.remove();
            frametimeElement = null;
            frametimeAreaElement.remove();
            frametimeAreaElement = null;
            doc.getElementById('frametime-checkbox').remove();
            doc.getElementById('frametime-checkbox-label').remove();
          }
        }

        const isStopped = animator.isStopped;
        animator.stop();

        measureTime(
          () => renderer.build(fsSource, null, uniformDict),
          elapsed => console.log('Build success: ' + new Date() + ', elapsed: ' + elapsed.toFixed(3) + ' msec'),
          elapsed => console.error('Build failed: ' + new Date() + ', elapsed: ' + elapsed.toFixed(3) + ' msec'));

        if (isFirstBuild || !isStopped) {
          start();
        } else {
          render();
        }

        canvas.style.display = '';
        compilerMessagesTextArea.value = '';
        compilerMessagesTextArea.style.display = 'none';
        if (doc.getElementById('tab-trans-vert').checked) {
          transVertTextArea.value = renderer.translatedVertexShaderSource;
        } else {
          transVertTextArea.value = '';
        }
        if (doc.getElementById('tab-trans-frag').checked) {
          transFragTextArea.value = renderer.translatedFragmentShaderSource;
        } else {
          transFragTextArea.value = '';
        }
      } catch (e) {
        console.error(e);
        canvas.style.display = 'none';
        compilerMessagesTextArea.value = e.message;
        compilerMessagesTextArea.style.display = '';
        transVertTextArea.value = '';
        transFragTextArea.value = '';
      }
    }

    if (needReload) {
      resizeContent();
    }

    return 0;
  }

  /**
   * Preprocess fragment shader source by target.
   * @param {string} fsSource Fragment shader source.
   * @param {string} target Target language.
   * @return Preprocessed fragment shader source.
   */
  function preprocess(fsSource, target) {
    switch (target) {
      case 'twigl-geeker':
        return Twigl.convertGeekerFs(fsSource);
      case 'twigl-geekest':
        return Twigl.convertGeekestFs(fsSource);
      case 'twigl-geeker-300es':
        return Twigl.convertGeekerFs300es(fsSource);
      case 'twigl-geekest-300es':
        return Twigl.convertGeekestFs300es(fsSource);
      default:
        return fsSource;
    }
  }

  /**
   * Get uniform dictionary.
   * @param {string} target Target language.
   * @return Name dictionary of uniform variables.
   */
  function getUniformDict(target) {
    switch (target) {
      case 'twigl-geek':
      case 'twigl-geeker':
      case 'twigl-geekest':
      case 'twigl-geek-300es':
      case 'twigl-geeker-300es':
      case 'twigl-geekest-300es':
        return {
          'time': 't',
          'mouse': 'm',
          'resolution': 'r',
          'frameCount': 'f',
          'backBuffer': 'b'
        };
      default:
        return {
          'time': 'u_time',
          'mouse': 'u_mouse',
          'resolution': 'u_resolution',
          'frameCount': 'u_frameCount',
          'backBuffer': 'u_backBuffer'
        };
    }
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

  /**
   * Download canvas as image data.
   * @param {string} fileName File name to donwload.
   */
  function downloadCanvas(fileName) {
    if (typeof fileName === 'undefined') {
      if (typeof getFileName === 'function') {
        // Get shader file, remove suffix and add ".png" as suffix.
        fileName = getFileName().replace(/.*[\/\\]/, '').replace(/\.[^.]*$/, '') + '.png';
      } else {
        fileName = 'canvas.png';
      }
    }

    const link = doc.createElement('a');
    link.download = fileName;

    const isStopped = animator.isStopped;
    stop();
    render();
    link.href = canvas.toDataURL(fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg'
      : fileName.endsWith('.webp') ? 'image/webp'
      : 'image/png');
    if (!isStopped) {
      start();
    }

    link.click();
  }

  function downloadSingleHtml(fileName) {
    if (typeof fileName === 'undefined') {
      if (typeof getFileName === 'function') {
        // Get shader file, remove suffix and add ".png" as suffix.
        fileName = getFileName().replace(/.*[\/\\]/, '').replace(/\.[^.]*$/, '') + '.html';
      } else {
        fileName = 'canvas.png';
      }
    }

    const isGlsl = getFileType() === 'glsl';
    const htmlText = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Language" content="en">
  <meta name="google" content="notranslate">
  <title>${doc.title}</title>
  <style>
  body {
    width: 100%;
    height: 100%;
    margin: 0;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
  </style>
</head>
<body>

<canvas id="canvas" width="512" height="512"></canvas>

<script id="vertex-shader" type="x-shader/x-vertex">${renderer.vertexShaderSource}
</script>
<script id="fragment-shader" type="x-shader/x-fragment">${renderer.fragmentShaderSource}
</script>
<script>
(function(global, doc) {
  'use strict';

  /**
   * ${isGlsl ? 'GLSL' : 'WGSL'} renderer.
   */
  ${isGlsl ? GlslQuadRenderer.toString() : WgslQuadRenderer.toString()}
  /**
   * Class for calling functions at regular intervals.
   */
  ${Animator.toString()}
  /**
   * Animator.
   * @type {Animator}
   */
  const canvas = doc.getElementById('canvas');
  /**
   * Animator.
   * @type {Animator}
   */
  const animator = new Animator();
  /**
   * GLSL renderer.
   * @type {GlslQuadRenderer}
   */
  const renderer = ${isGlsl ? 'new GlslQuadRenderer(canvas)' : 'await WgslQuadRenderer.create(canvas)'};
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
   * Render created GLSL program.
   */
  function render() {
    const time = animator.totalElapsedTime * 0.001;

    const w = canvas.width;
    const h = canvas.height;

    renderer.setUniforms(time, mx, my, w, h);
    renderer.render(w, h);
  }

  /**
   * Resize canvas.
   */
  function resizeContent() {
    canvas.width = global.innerWidth;
    canvas.height = global.innerHeight;
    render();
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

  /**
   * Toggle fullscreen.
   */
  function toggleFullscreen() {
    if (doc.fullscreenElement === null) {
      canvas.requestFullscreen();
    } else {
      doc.exitFullscreen();
    }
  }

  global.addEventListener('resize', resizeContent, true);

  doc.addEventListener('keydown', e => {
    if (e.defaultPrevented) {
      return;
    }

    let isAltEnterPressed = false;
    if (typeof e.key !== 'undefined') {
      isAltEnterPressed = e.key === 'Enter' && e.altKey;
    } else if (typeof e.keyIdentifier !== 'undefined') {
      isAltEnterPressed = e.keyIdentifier === 'Enter' && e.altKey;
    } else if (typeof e.keyCode !== 'undefined') {
      isAltEnterPressed = e.keyCode === 13 && e.altKey;
    }

    if (isAltEnterPressed) {
      toggleFullscreen();
      e.preventDefault();
    }
  });

  canvas.addEventListener('mousemove', e => {
    mx = e.offsetX / (canvas.width);
    my = (1.0 - e.offsetY / (canvas.height));
  }, true);

${isGlsl ? '  renderer.useBackBuffer = true;' : ''}
  try {
    const vsSource = doc.getElementById('vertex-shader').innerText;
    const fsSource = doc.getElementById('fragment-shader').innerText;
    const uniformDict = ${JSON.stringify(getUniformDict(typeof getTarget === 'function' ? getTarget() : 'auto'))};
    measureTime(
      () => renderer.build(fsSource, vsSource${isGlsl ? ', uniformDict' : ''}),
      elapsed => console.log('Build success: ' + new Date() + ', elapsed: ' + elapsed.toFixed(3) + ' msec'),
      elapsed => console.error('Build failed: ' + new Date() + ', elapsed: ' + elapsed.toFixed(3) + ' msec'));
    resizeContent();
  } catch (e) {
    console.error(e);
  }

  animator.start(render);
})((this || 0).self || global, document);
</script>

</body>
</html>
`;

    const link = doc.createElement('a');
    link.download = fileName;
    link.href = URL.createObjectURL(new Blob([htmlText], {type: 'application/octet-stream'}));
    link.click();
  }

  /**
   * Toggle fullscreen.
   */
  function toggleFullscreen() {
    if (doc.fullscreenElement === null) {
      canvas.requestFullscreen();
    } else {
      doc.exitFullscreen();
    }
  }

  //
  // Export functions.
  //
  global.downloadCanvas = downloadCanvas;
  global.downloadSingleHtml = downloadSingleHtml;
  global.toggleFullscreen = toggleFullscreen;
})((this || 0).self || global);
