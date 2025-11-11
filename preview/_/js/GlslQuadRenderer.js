;(function(moduleDef) {
  'use strict';

  // https://github.com/kriskowal/q

  // This file will function properly as a <script> tag,
  // or a module using CommonJS and NodeJS or RequireJS module formats.
  // In Common/Node/RequireJS, the module exports the GlslQuadRenderer API
  // and when executed as a simple <script>, it creates a GlslQuadRenderer global instead.

  if (typeof bootstrap === 'function') {
    // Montage Require
    bootstrap('promise', moduleDef);
  } else if (typeof exports === 'object' && typeof module === 'object') {
    // NodeJS or CommonJS
    module.exports = moduleDef();
  } else if (typeof define === 'function' && define.amd) {
    // RequireJS
    define(moduleDef);
  } else if (typeof ses !== 'undefined') {
    // SES (Secure EcmaScript)
    if (!ses.ok()) {
      return;
    } else {
      ses.makeGlslQuadRenderer = moduleDef;
    }
  } else if (typeof window !== 'undefined' || typeof self !== 'undefined') {
    // <script>
    // Prefer window over self for add-on scripts.
    // Use self for non-windowed contexts.
    let global = typeof window !== 'undefined' ? window
      : typeof self !== 'undefined' ? self
      : null;
    if (global === null) {
      // SpiderMonkey or Rhino
      try {
        global = Function('return this')();
      } catch (Error) {
        throw new Error('This environment was not anticipated by hoge.js.');
      }
    }

    // Get the `window` object, save the previous GlslQuadRenderer global and initialize GlslQuadRenderer as a global.
    const prevDefinition = global.GlslQuadRenderer;
    global.GlslQuadRenderer = moduleDef();

    // Add a noConflict function so GlslQuadRenderer can be removed from the global namespace.
    global.GlslQuadRenderer.noConflict = function() {
      if (typeof prevDefinition === 'undefined') {
        delete global.GlslQuadRenderer;
      } else {
        global.GlslQuadRenderer = prevDefinition;
      }
      return this;
    };
  }
})(function() {
  'use strict';

  /**
   * GLSL renderer.
   */
  return class GlslQuadRenderer {
    /**
     * Vertex position data array.
     * @type {Float32Array}
     */
    static #vertices = new Float32Array([
      -1.0, 1.0, 0.0,
      1.0, 1.0, 0.0,
      -1.0, -1.0, 0.0,
      1.0, -1.0, 0.0
    ]);
    /**
     * Triangle index data array.
     * @type {Uint16Array}
     */
    static #triangles = new Uint16Array([
      0, 2, 1,
      1, 2, 3
    ]);
    /**
     * Default uniform dictionary.
     * @type {Object}
     */
    static #defaultUniformDict = {
      'time': 'u_time',
      'mouse': 'u_mouse',
      'resolution': 'u_resolution',
      'frameCount': 'u_frameCount',
      'backBuffer': 'u_backBuffer'
    };
    /**
     * WebGL context of canvas.
     * @type {WebGLRenderingContext}
     */
    #gl;
    /**
     * Uniform variable locations.
     * @type {Array}
     */
    #uniformLocations;
    /**
     * A flag whether use back buffer in sahder or not.
     * @type {boolean}
     */
    #useBackBuffer;
    /**
     * Previout frame texture dictionary.
     * @type {Object}
     */
    #prevFrame;
    /**
     * A flag whether shader has been already built or not.
     * @type {boolean}
     */
    #hasBuilt;
    /**
     * Cached compiled default GLSL ES 1.0 vertex shader.
     * @type {WebGLShader}
     */
    #defaultVs100es = null;
    /**
     * Cached compiled default GLSL ES 3.0 vertex shader.
     * @type {WebGLShader}
     */
    #defaultVs300es = null;
    /**
     * Vertex shader that succeeded to compile.
     * @type {String}
     */
    #vsSource = null;
    /**
     * Vertex shader.
     * @type {WebGLShader}
     */
    #vertexShader;
    /**
     * Cache of translated vertex shader source.
     * @type {string}
     */
    #translatedVsSource;
    /**
     * Fragment shader that succeeded to compile.
     * @type {String}
     */
    #fsSource = null;
    /**
     * Fragment shader.
     * @type {WebGLShader}
     */
    #fragmentShader;
    /**
     * Cache of translated fragment shader source.
     * @type {string}
     */
    #translatedFsSource;
    /**
     * WebGL extension of WEBGL_debug_shaders.
     * @type {Object}
     */
    #extDebugShader;
    /**
     * WebGL extension of EXT_disjoint_timer_query or EXT_disjoint_timer_query_webgl2.
     * @type {Object}
     */
    #extDisjointTimerQuery;
    /**
     * Begin measuring frametime.
     * @type {function(): object}
     */
    #beginMeasurement;
    /**
     * End measuring frametime.
     * @type {function(Object)}
     */
    #endMeasurement;
    /**
     * Update sum of frametime for moving average.
     * @type {function()}
     */
    #updateFrametime;
    /**
     * Retrieve moving average value of frametime.
     * @type {function(): number}
     */
    #retrieveFrametime;

    /**
     * Create WebGL/WebGL2 context from specified canvas.
     * @param {HTMLCanvasElement} canvas Render target canvas.
     */
    constructor(canvas) {
      const attrs = {alpha: false};
      const gl = canvas.getContext('webgl2', attrs)
        || canvas.getContext('webgl', attrs)
        || canvas.getContext('experimental-webgl', attrs);
      if (gl === null) {
        throw new Error('WebGL 2.0 or WebGL is not supported.');
      }
      this.#gl = gl;
      this.#uniformLocations = new Array(4);
      this.#useBackBuffer = false;
      this.#prevFrame = null;
      this.#hasBuilt = false;

      this.#vertexShader = null;
      this.#translatedVsSource = null;
      this.#fragmentShader = null;
      this.#translatedFsSource = null;
      this.#extDebugShader = gl.getExtension('WEBGL_debug_shaders');
      this.#extDisjointTimerQuery = gl.getExtension('EXT_disjoint_timer_query_webgl2')
        || gl.getExtension('EXT_disjoint_timer_query');
      this.disableMeasureFrametime();
    }

    /**
     * Build shader program.
     * @param {string} fsSource Fragment shader source code.
     * @param {string} vsSource Vertex shader source code (optional).
     */
    build(fsSource, vsSource, uniformDict) {
      const gl = this.#gl;

      this.#vertexShader = null;
      this.#translatedVsSource = null;
      this.#fragmentShader = null;
      this.#translatedFsSource = null;
      this.#hasBuilt = false;

      let vs;
      if (!!vsSource) {
        vs = this.#createShaderFromText(vsSource, gl.VERTEX_SHADER);
        this.#vsSource = vsSource;
      } else if (fsSource.match(/^\s*#\s*version\s+300\s+es/) !== null) {
        vs = this.#getVertexShader300es();
        this.#vsSource = GlslQuadRenderer.vsSource300es;
      } else {
        vs = this.#getVertexShader100es();
        this.#vsSource = GlslQuadRenderer.vsSource100es;
      }

      if (this.#extDebugShader !== null) {
        this.#vertexShader = vs;
      }

      const fs = this.#createShaderFromText(fsSource, gl.FRAGMENT_SHADER);
      this.#fsSource = fsSource;

      const program = this.#createProgram(vs, fs);

      if (!uniformDict) {
        uniformDict = GlslQuadRenderer.#defaultUniformDict;
      }

      this.#uniformLocations[0] = gl.getUniformLocation(program, typeof uniformDict.time === 'undefined' ? GlslQuadRenderer.#defaultUniformDict.time : uniformDict.time);
      this.#uniformLocations[1] = gl.getUniformLocation(program, typeof uniformDict.mouse === 'undefined' ? GlslQuadRenderer.#defaultUniformDict.mouse : uniformDict.mouse);
      this.#uniformLocations[2] = gl.getUniformLocation(program, typeof uniformDict.resolution === 'undefined' ? GlslQuadRenderer.#defaultUniformDict.resolution : uniformDict.resolution);
      this.#uniformLocations[3] = gl.getUniformLocation(program, typeof uniformDict.frameCount === 'undefined' ? GlslQuadRenderer.#defaultUniformDict.frameCount : uniformDict.frameCount);
      if (this.#useBackBuffer) {
        gl.uniform1i(gl.getUniformLocation(program, typeof uniformDict.backBuffer === 'undefined' ? GlslQuadRenderer.#defaultUniformDict.backBuffer : uniformDict.backBuffer), 0);
        this.#prevFrame = this.#createFrameTexture(gl.drawingBufferWidth, gl.drawingBufferHeight);
      }

      const attribLocation = gl.getAttribLocation(program, 'position');
      gl.bindBuffer(gl.ARRAY_BUFFER, this.#createVbo(GlslQuadRenderer.#vertices));
      gl.enableVertexAttribArray(attribLocation);
      gl.vertexAttribPointer(attribLocation, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.#createIbo(GlslQuadRenderer.#triangles));

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);

      gl.clearColor(0.0, 0.0, 0.0, 1.0);

      this.#hasBuilt = true;
      if (this.#extDebugShader !== null) {
        this.#fragmentShader = fs;
      }
    }

    /**
     * Set uniform variables.
     * @param {number} time Elapsed time.
     * @param {number} mx Mouse move offset of X.
     * @param {number} my Mouse move offset of Y.
     * @param {number} width Width of viewport.
     * @param {number} height Height of viewport.
     * @param {number} frameCount Frame count.
     */
    setUniforms(time, mx, my, width, height, frameCount) {
      const gl = this.#gl;
      gl.uniform1f(this.#uniformLocations[0], time);
      gl.uniform2f(this.#uniformLocations[1], mx, my);
      gl.uniform2f(this.#uniformLocations[2], width, height);
      gl.uniform1f(this.#uniformLocations[3], frameCount);
    }

    /**
     * Render one frame.
     * @param {number} width Width of viewport.
     * @param {number} height Height of viewport.
     */
    render(width, height) {
      const gl = this.#gl;

      const query = this.#beginMeasurement();

      if (this.#useBackBuffer) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.#prevFrame.texture);
      }

      gl.viewport(0, 0, width, height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

      if (this.#useBackBuffer) {
        // Resize back buffer texture.
        if (this.#prevFrame.width !== width || this.#prevFrame.height !== height) {
          this.#prevFrame = this.#createFrameTexture(width, height);
        }
        // Copy rendering result to back buffer texture.
        // gl.activeTexture(gl.TEXTURE0);
        // gl.bindTexture(gl.TEXTURE_2D, this.#prevFrame.texture);
        gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGB, 0, 0, width, height, 0);
      }

      gl.flush();

      this.#endMeasurement(query);
      this.#updateFrametime();
    }

    /**
     * Enable measuring frametime.
     * @param {number} size Window size of moving average for frametime.
     * @return {boolean} True if frametime measurement is available, otherwise false.
     */
    enableMeasureFrametime(size) {
      if (this.#extDisjointTimerQuery === null) {
        return false;
      }

      const usingList = [];
      const availableList = [];

      size = typeof size !== 'undefined' ? size : 60;
      let count = 0;
      let index = 0;
      let sum = 0;
      const dataArray = new Float64Array(size);
      const append = value => {
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
      };

      this.#retrieveFrametime = () => count === 0 ? 0 : sum / count;

      if (this.#extDisjointTimerQuery.toString() === '[object EXTDisjointTimerQueryWebGL2]') {
        this.#beginMeasurement = () => {
          const availableQuery = availableList.length ? availableList.shift() : this.#gl.createQuery();
          this.#gl.beginQuery(this.#extDisjointTimerQuery.TIME_ELAPSED_EXT, availableQuery);
          return availableQuery;
        };

        this.#endMeasurement = query => {
          this.#gl.endQuery(this.#extDisjointTimerQuery.TIME_ELAPSED_EXT, query);
          usingList.push(query);
        };

        this.#updateFrametime = () => {
          const gl = this.#gl;

          if (gl.getParameter(this.#extDisjointTimerQuery.GPU_DISJOINT_EXT)) {
            for (let query of usingList) {
              gl.deleteQuery(query)
            }
            return;
          }

          for (let usingQuery = usingList[0]; typeof usingQuery !== 'undefined'; usingQuery = usingList[0]) {
            if (!gl.getQueryParameter(usingQuery, gl.QUERY_RESULT_AVAILABLE)) {
              break;
            }

            const result = gl.getQueryParameter(usingQuery, gl.QUERY_RESULT);
            availableList.push(usingList.shift());
            append(result);

            usingList.shift();
          }
        };
      } else {
        this.#beginMeasurement = () => {
          const ext = this.#extDisjointTimerQuery;
          const availableQuery = availableList.length ? availableList.shift() : ext.createQueryEXT();
          ext.beginQueryEXT(ext.TIME_ELAPSED_EXT, availableQuery);
          return availableQuery;
        };

        this.#endMeasurement = query => {
          if (query === null) {
            return;
          }
          const ext = this.#extDisjointTimerQuery;
          ext.endQueryEXT(ext.TIME_ELAPSED_EXT, query);
          usingList.push(query);
        };

        this.#updateFrametime = () => {
          const ext = this.#extDisjointTimerQuery;

          if (this.#gl.getParameter(ext.GPU_DISJOINT_EXT)) {
            for (let query of usingList) {
              ext.deleteQueryEXT(query);
            }
            return;
          }

          for (let usingQuery = usingList[0]; typeof usingQuery !== 'undefined'; usingQuery = usingList[0]) {
            if (!ext.getQueryObjectEXT(usingQuery, ext.QUERY_RESULT_AVAILABLE_EXT)) {
              break;
            }

            const result = ext.getQueryObjectEXT(usingQuery, ext.QUERY_RESULT_EXT);
            availableList.push(usingList.shift());
            append(result);

            usingList.shift();
          }
        };
      }

      return true;
    }

    /**
     * Disable measuring frametime.
     */
    disableMeasureFrametime() {
      this.#beginMeasurement = () => null;
      this.#endMeasurement = query => {};
      this.#updateFrametime = () => {};
      this.#retrieveFrametime = () => -1;
    }

    /**
     * Get a flag whether use back buffer in sahder or not.
     * @return {boolean} True if use back buffer, otherwise false.
     */
    get useBackBuffer() {
      return this.#useBackBuffer;
    }

    /**
     * Set a flag whether use back buffer in sahder or not.
     */
    set useBackBuffer(value) {
      this.#useBackBuffer = value;
    }

    /**
     * Get a flag whether shader has been already built or not.
     * @return {boolean} True if shader has been already built, otherwise false.
     */
    get hasBuilt() {
      return this.#hasBuilt;
    }

    /**
     * Get smoothed frametime.
     * @return {number} Frametime in nanoseconds.
     */
    get frametime() {
      return this.#retrieveFrametime();
    }

    /**
     * Vertex shader source code.
     * @type {string}
     */
    get vertexShaderSource() {
      return this.#vsSource;
    }

    /**
     * Get translated vertex shader source.
     * @return {string} Translated vertex shader source.
     */
    get translatedVertexShaderSource() {
      if (this.#translatedVsSource !== null) {
        return this.#translatedVsSource;
      }
      if (this.#extDebugShader === null || this.#vertexShader === null) {
        return null;
      }
      this.#translatedVsSource = this.#extDebugShader.getTranslatedShaderSource(this.#vertexShader)
      return this.#translatedVsSource;
    }

    /**
     * Fragment shader source code for GLSL ES 1.0.
     * @type {string}
     */
    get fragmentShaderSource() {
      return this.#fsSource;
    }

    /**
     * Get translated fragment shader source.
     * @return {string} Translated fragment shader source.
     */
    get translatedFragmentShaderSource() {
      if (this.#translatedFsSource !== null) {
        return this.#translatedFsSource;
      }
      if (this.#extDebugShader === null || this.#fragmentShader === null) {
        return null;
      }
      this.#translatedFsSource = this.#extDebugShader.getTranslatedShaderSource(this.#fragmentShader)
      return this.#translatedFsSource;
    }

    /**
     * Get default GLSL ES 1.0 vertex shader.
     * @return {WebGLShader} Created vertex shader.
     */
    #getVertexShader100es() {
      if (this.#defaultVs100es === null) {
        this.#defaultVs100es = this.#createShaderFromText(GlslQuadRenderer.vsSource100es, this.#gl.VERTEX_SHADER);
      }
      return this.#defaultVs100es;
    }

    /**
     * Get default GLSL ES 3.0 vertex shader.
     * @return {WebGLShader} Created vertex shader.
     */
    #getVertexShader300es() {
      if (this.#defaultVs300es === null) {
        this.#defaultVs300es = this.#createShaderFromText(GlslQuadRenderer.vsSource300es, this.#gl.VERTEX_SHADER);
      }
      return this.#defaultVs300es;
    }

    /**
     * Compile shader source code.
     * @param {string} text Shader souce code.
     * @param {number} shaderType Shader type constant.
     * @return {WebGLShader} Created shader.
     */
    #createShaderFromText(text, shaderType) {
      const gl = this.#gl;
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
    #createProgram(vs, fs) {
      const gl = this.#gl;
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
    #createVbo(vertices) {
      const gl = this.#gl;
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      return vbo;
    }

    /**
     * Create IBO (Index Buffer Object).
     * @param {Uint16Array} Triangle index data array.
     * @return {WebGLBuffer} Created IBO.
     */
    #createIbo(triangles) {
      const gl = this.#gl;
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triangles, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      return ibo;
    }

    /**
     * Create frame texture.
     * @param {number} width Width of texture.
     * @param {number} height Height of texture.
     * @return {Object} Dictionary of texture, its width and height.
     */
    #createFrameTexture(width, height) {
      const gl = this.#gl;
      const texture = gl.createTexture();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      return {
        texture: texture,
        width: width,
        height: height
      };
    }

    /**
     * Vertex shader source code for GLSL ES 1.0.
     * @type {string}
     */
    static get vsSource100es() {
      return "attribute vec3 position;\nvoid main(void)\n{\n  gl_Position = vec4(position, 1.0);\n}\n";
    }

    /**
     * Vertex shader source code for GLSL ES 3.0.
     * @type {string}
     */
    static get vsSource300es() {
      return "#version 300 es\nin vec3 position;\nvoid main(void)\n{\n  gl_Position = vec4(position, 1.0);\n}\n";
    }

    /**
     * noConflict() for non global.
     */
    static noConflict() {
      throw new Error('GlslQuadRenderer.noConflict only works when GlslQuadRenderer is used as a global');
    }
  }
});
