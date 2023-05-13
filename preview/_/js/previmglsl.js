;(function(global, undefined) {
  'use strict';

  /**
   * Cache of window.document.
   * @type {Document}
   */
  const doc = global.document;
  /**
   * Framerate
   * @type {number}
   */
  const fps = 1000 / 60;
  /**
   * GLSL renderer.
   * @type {GlslQuadRenderer}
   */
  let renderer = null;
  /**
   * Canvas.
   * @type {HTMLCanvasElement}
   */
  let canvas;
  /**
   * Canvas.
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
   * Interval ID for render().
   * @type {number}
   */
  let intervalId = -1;
  /**
   * Base timestamp.
   * @type {number}
   */
  let baseTime;

  window.addEventListener('load', () => {
    canvas = doc.getElementById('canvas');
    canvas.addEventListener('mousemove', e => {
      mx = e.offsetX / canvas.width;
      my = e.offsetY / canvas.height;
    }, true);
    compilerMessagesElement = doc.getElementById('compiler-messages');
    loadContentScript();
    global.setInterval(loadContentScript, 1000);
  });

  /**
   * Render created GLSL program.
   */
  function render() {
    const elapsedTime = (new Date().getTime() - baseTime) * 0.001;

    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    renderer.setUniforms(elapsedTime, mx, my, w, h);
    renderer.render(w, h);
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
        if (renderer === null) {
          if (getFileType() === 'glsl') {
            renderer = new GlslQuadRenderer(canvas);
          } else {
            renderer = await WgslQuadRenderer.create(canvas);
          }
        }

        if (intervalId !== -1) {
          clearInterval(intervalId);
        }
        renderer.build(fsText);

        const d = new Date();
        console.log("Rebuild done: " + d);

        baseTime = d.getTime();
        intervalId = global.setInterval(render, fps);
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
  }
})((this || 0).self || global);
