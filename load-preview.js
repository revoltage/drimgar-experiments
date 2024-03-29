function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

async function showPreview(colorImgUrl, depthImgUrl) {
  const previewDiv = document.getElementById('preview');
  previewDiv.innerHTML = ``;

  const colorImg = await loadImage(colorImgUrl);
  const depthImg = await loadImage(depthImgUrl);

  const canvas = document.createElement('canvas');
  previewDiv.appendChild(canvas);

  // Assuming both images have the same dimensions
  canvas.width = colorImg.width;
  canvas.height = colorImg.height;

  // Assuming renderMSDFImage can handle both color and depth images
  return renderMSDFImage(canvas, colorImg, depthImg);
}

function getUrlParams(defaultValues = {}) {
  const params = new URLSearchParams(window.location.search);
  let urlParams = { ...defaultValues };
  for (let param of params) {
    let [key, value] = param;
    urlParams[key] = value;
  }
  return urlParams;
}

const urlParams = getUrlParams({
  art: 'eurydice-02',
  str: '1',
  fscale: '1.0', // '0.03'
  fdepth: '0.05', // '0.02'
  alt: undefined,
});

const ART = urlParams['art'];
const STRENGTH = +urlParams['str'];

const ART_COL = `https://storage.drimgar.com/illustrations/${ART}.jpg`;
const ART_DPT = `https://temporar.web.app/${ART.replace(/\//g, '+')}-dpt_beit_large_512.png`;
// const ART_DPT = `./img/${ART}-depth.jpg`;

showPreview(ART_COL, ART_DPT).then(ctrl => {
  const previewDiv = document.getElementById('preview');

  const loop = () => {
    const now = performance.now();
    const speed = 0.0025;
    // const strength = Math.abs(Math.sin(now * 0.00051)) * STRENGTH;
    const strength = STRENGTH;
    const shift = [
      //
      strength * Math.sin(now * speed),
      strength * Math.cos(now * speed),
    ];

    previewDiv.style.transform = `
            translate(-50%, -50%)
            perspective(600px)
            rotateY(${-shift[0] * 10}deg)
            rotateX(${shift[1] * 10}deg)
          `;
    ctrl.setShift(shift);
    ctrl.draw();

    requestAnimationFrame(loop);
  };
  loop();
});

function renderMSDFImage(canvas, colorImg, depthImg) {
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    throw new Error('WebGL context not available');
  }

  // Create vertex shader
  const vertexShaderSource = document.getElementById('vertex-shader').textContent;
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vertexShader, vertexShaderSource);
  gl.compileShader(vertexShader);

  // Check if vertex shader compiled successfully
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    throw new Error('Unable to compile vertex shader: ' + gl.getShaderInfoLog(vertexShader));
  }

  // Create fragment shader
  const fragmentShaderSourceId =
    urlParams['alt'] !== undefined ? 'fragment-shader-alt' : 'fragment-shader';
  const fragmentShaderSource = document.getElementById(fragmentShaderSourceId).textContent;
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fragmentShader, fragmentShaderSource);
  gl.compileShader(fragmentShader);

  // Check if fragment shader compiled successfully
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    throw new Error('Unable to compile fragment shader: ' + gl.getShaderInfoLog(fragmentShader));
  }

  // Create program
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  // Check if program linked successfully
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Unable to link shader program: ' + gl.getProgramInfoLog(program));
  }

  // Create buffer
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  const positions = [-1, -1, -1, 1, 1, -1, 1, 1];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  const texCoords = [0, 1, 0, 0, 1, 1, 1, 0];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

  // Create color texture
  const colorTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, colorTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, colorImg);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Create depth texture
  const depthTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, depthTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, depthImg);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Set up attributes and uniforms
  const positionAttributeLocation = gl.getAttribLocation(program, 'aVertexPosition');
  const texCoordAttributeLocation = gl.getAttribLocation(program, 'aTextureCoord');

  // Set up uniforms
  const colorTextureUniformLocation = gl.getUniformLocation(program, 'imageSampler');
  const depthTextureUniformLocation = gl.getUniformLocation(program, 'mapSampler');

  let projectionMatrixLocation = gl.getUniformLocation(program, 'projectionMatrix');
  let filterMatrixLocation = gl.getUniformLocation(program, 'filterMatrix');

  let scaleLocation = gl.getUniformLocation(program, 'scale');
  let offsetLocation = gl.getUniformLocation(program, 'offset');
  let focusLocation = gl.getUniformLocation(program, 'focus');
  let enlargeLocation = gl.getUniformLocation(program, 'enlarge');
  let aspectLocation = gl.getUniformLocation(program, 'aspect');
  let inputSizeLocation = gl.getUniformLocation(program, 'inputSize');
  let outputFrameLocation = gl.getUniformLocation(program, 'outputFrame');
  
  let wLocation = gl.getUniformLocation(program, 'widthPx');
  let hLocation = gl.getUniformLocation(program, 'heightPx');

  // Create a new dat.GUI instance
  let gui = new dat.GUI();

  let projectionMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let filterMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  // Define an object to hold your uniforms
  let uniforms = {
    dilation: 1.0,
    offset: [0.0, 0.0, 0.0],
    focus: 0.2,
    enlarge: 1.0,
    aspect: canvas.width / canvas.height,
    inputSize: [1.0, 1.0, 1.0, 1.0],
    outputFrame: [-1, 1, 2.0, 2.0],

    //
    offsetMultiplier: 0.075,
  };

  // Add controls for each uniform
  gui.add(uniforms, 'dilation', 0.1, 2.0);
  gui.addColor(uniforms, 'offset');
  gui.add(uniforms, 'focus', 0.1, 1.0);
  gui.add(uniforms, 'enlarge', 0.1, 2.0);
  gui.add(uniforms, 'aspect', 0.1, 2.0);
  gui.addColor(uniforms, 'inputSize');
  gui.addColor(uniforms, 'outputFrame');
  gui.add(uniforms, 'offsetMultiplier', 0.0, 0.2);

  function draw() {
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.enableVertexAttribArray(texCoordAttributeLocation);
    gl.vertexAttribPointer(texCoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, colorTexture);
    gl.uniform1i(colorTextureUniformLocation, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.uniform1i(depthTextureUniformLocation, 1);

    gl.uniformMatrix3fv(projectionMatrixLocation, false, new Float32Array(projectionMatrix));
    gl.uniformMatrix3fv(filterMatrixLocation, false, new Float32Array(filterMatrix));

    gl.uniform1f(scaleLocation, uniforms.dilation);
    gl.uniform3fv(offsetLocation, new Float32Array(uniforms.offset));
    gl.uniform1f(focusLocation, uniforms.focus);
    gl.uniform1f(enlargeLocation, uniforms.enlarge);
    gl.uniform1f(aspectLocation, uniforms.aspect);
    gl.uniform4fv(inputSizeLocation, new Float32Array(uniforms.inputSize));

    /// outputframe, but compensating for .enlarge scaleFactor
    const ofr = [
      uniforms.outputFrame[0] / uniforms.enlarge,
      uniforms.outputFrame[1] / uniforms.enlarge,
      uniforms.outputFrame[2] * uniforms.enlarge,
      uniforms.outputFrame[3] * uniforms.enlarge,
    ]
    gl.uniform4fv(outputFrameLocation, new Float32Array(ofr));

    gl.uniform1f(wLocation, canvas.width);
    gl.uniform1f(hLocation, canvas.height);

    // Render
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return {
    setShift: function (newShift) {
      uniforms.offset[0] = newShift[0] * -uniforms.offsetMultiplier;
      // uniforms.offset[1] = newShift[1] * uniforms.offsetMultiplier;
      uniforms.offset[2] = newShift[1] * -uniforms.offsetMultiplier;
    },
    draw,
  };
}
