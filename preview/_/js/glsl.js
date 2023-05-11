;(function(global, undefined) {
  'use strict';

  /**
   * Cache of window.document.
   * @type {Document}
   */
  const doc = global.document;
  /**
   * Vertex position data array.
   * @type {Float32Array}
   */
  const vertices = new Float32Array([
    -1.0, 1.0, 0.0,
    1.0, 1.0, 0.0,
    -1.0, -1.0, 0.0,
    1.0, -1.0, 0.0
  ]);
  /**
   * Triangle index data array.
   * @type {Int16Array}
   */
  const triangles = new Int16Array([
    0, 2, 1,
    1, 2, 3
  ]);
  /**
   * Vertex shader source code for GLSL ES 1.0.
   * @type {string}
   */
  const vsText100es = "attribute vec3 position;\nvoid main(void)\n{\n  gl_Position = vec4(position, 1.0);\n}";
  /**
   * Vertex shader source code for GLSL ES 3.0.
   * @type {string}
   */
  const vsText300es = "#version 300 es\nin vec3 position;\nvoid main(void)\n{\n  gl_Position = vec4(position, 1.0);\n}";
  /**
   * Framerate
   * @type {number}
   */
  const fps = 1000 / 60;

  /**
   * Canvas.
   * @type {HTMLCanvasElement}
   */
  let canvas;
  /**
   * WebGL context of canvas.
   * @type {WebGLRenderingContext}
   */
  let gl;
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
  /**
   * Uniform variable locations.
   * @type {Array}
   */
  let uniformLocations = new Array();

  window.addEventListener('load', () => {
    canvas = doc.getElementById('canvas');
    canvas.addEventListener('mousemove', e => {
      mx = e.offsetX / canvas.width;
      my = e.offsetY / canvas.height;
    }, true);
    gl = canvas.getContext('webgl2')
      || canvas.getContext('experimental-webgl2')
      || canvas.getContext('webgl')
      || canvas.getContext('experimental-webgl');

    loadContentScript();
    global.setInterval(loadContentScript, 1000);
  });

  /**
   * Rebuild shader program and start rendering.
   * @param {string} vsText Vertex shader souce code.
   * @param {string} fsText Fragment shader souce code.
   */
  function rebuildShader(vsText, fsText) {
    if (intervalId !== -1) {
      clearInterval(intervalId);
    }

    const program = createProgram(
      createShaderFromText(vsText, gl.VERTEX_SHADER),
      createShaderFromText(fsText, gl.FRAGMENT_SHADER));

    uniformLocations[0] = gl.getUniformLocation(program, 'u_time');
    uniformLocations[1] = gl.getUniformLocation(program, 'u_mouse');
    uniformLocations[2] = gl.getUniformLocation(program, 'u_resolution');

    const attribLocation = gl.getAttribLocation(program, 'position');
    gl.bindBuffer(gl.ARRAY_BUFFER, createVbo(vertices));
    gl.enableVertexAttribArray(attribLocation);
    gl.vertexAttribPointer(attribLocation, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, createIbo(triangles));

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
  }

  /**
   * Render created GLSL program.
   */
  function render() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);

    const elapsedTime = (new Date().getTime() - baseTime) * 0.001;

    gl.clear(gl.COLOR_BUFFER_BIT);

    // Set uniform variables.
    gl.uniform1f(uniformLocations[0], elapsedTime);
    gl.uniform2fv(uniformLocations[1], [mx, my]);
    gl.uniform2fv(uniformLocations[2], [w, h]);

    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.flush();
  }

  /**
   * Compile shader source code.
   * @param {string} text Shader souce code.
   * @param {number} shaderType Shader type constant.
   * @return {WebGLShader} Created shader.
   */
  function createShaderFromText(text, shaderType) {
    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, text);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }

    return shader;
  }

  /**
   * Create and link program.
   * @param {WebGLShader,WebGL2Shader} vs Vertex shader.
   * @param {WebGLShader,WebGL2Shader} fs Fragment shader.
   * @return {WebGLProgram,WebGL2Program} Created shader.
   */
  function createProgram(vs, fs) {
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }

    gl.useProgram(program);
    return program;
  }

  /**
   * Create VBO (Vertex Buffer Object).
   * @param {Float32Array} Vertex position data array.
   * @return {WebGLBuffer} Created VBO.
   */
  function createVbo(vertices) {
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return vbo;
  }

  /**
   * Create IBO (Index Buffer Object).
   * @param {Int16Array} Triangle index data array.
   * @return {WebGLBuffer} Created IBO.
   */
  function createIbo(triangles) {
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triangles, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    return ibo;
  }

  /**
   * Determine if reloading is necessary, and if so, rebuild the program and reload.
   */
  function loadPreview() {
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
        rebuildShader(
          fsText.match(/^\s*#\s*version\s*300\s+es/) === null ? vsText100es : vsText300es,
          fsText);

        const d = new Date();
        console.log("Rebuild done: " + d);

        baseTime = d.getTime();
        global.setInterval(render, fps);
      } catch (e) {
        console.error(e);
      }
    }
  }

  /**
   * Load javascript by creating script element.
   */
  function loadContentScript() {
    const script = doc.createElement('script');
    script.type = 'text/javascript';
    script.src = 'js/content.js?t=' + new Date().getTime();
    script.addEventListener('load', () => {
      loadPreview();
      global.setTimeout(() => script.parentNode.removeChild(script), 160);
    });
    doc.getElementsByTagName('head')[0].appendChild(script);
  }
})((this || 0).self || global);
