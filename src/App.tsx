import React, { useCallback, useRef, useState } from 'react';
import { BrowserRouter as Router, Switch, Route } from 'react-router-dom';
import useAnimationFrame from 'use-animation-frame';
import { Upload, message, Button, Carousel, Progress } from 'antd';
import { RcFile } from 'antd/lib/upload';
import { BuildOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import classifyPoint from "robust-point-in-polygon";
import { hashCode as HashCode } from "hashcode";
import path from "path";
import electron from "electron";
import { promises as fs } from "fs";
const dialog = electron.remote.dialog;
const hashCode = HashCode();

import './App.global.css';
import { generateCutout, OBJ, processOBJ, renderTexture, transformUV } from './processor';
import { runYieldTasks } from './util';

function getMousePos(canvas: HTMLCanvasElement, evt: React.MouseEvent) {
  var rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

const previewRenderer = new OffscreenCanvas(512, 512);

const Hello = () => {
  const [canvasRef, setCanvasRef] = useState<HTMLCanvasElement>();
  const [textureCount, setTextureCount] = useState<number>(0);

  const drawState = useRef({
    mouse: { x: 0, y: 0 },
    poly: [] as [number, number][],
    obj: null as (OBJ | null),
    textureSets: new Map<string, Map<string | null, HTMLImageElement>>(),
    textureSize: { width: 512, height: 512 }
  });

  useAnimationFrame(() => {
    if (!canvasRef) return;

    const ctx = canvasRef.getContext("2d");
    if (!ctx) return;

    const state = drawState.current;

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvasRef.width, canvasRef.height);

    // if (state.poly.length > 0) {
    //   ctx.fillStyle = "red";
    //   ctx.beginPath();
    //   for (let i = 0; i < state.poly.length; i++) {
    //     ctx.lineTo(state.poly[i][0], state.poly[i][1]);
    //   }
    //   ctx.lineTo(state.poly[0][0], state.poly[0][1]);
    //   ctx.stroke();
    // }

    if (!state.obj) return;

    const textures = state.textureSets.get("baseColor");
    if (textures && textures.size > 0) {
      renderTexture(ctx, previewRenderer, state.obj, textures, "baseColor");
    }

    const texVerts = state.obj.texVerts
    for (const vt of texVerts) {
      ctx.fillStyle = "red";
      ctx.beginPath();
      const uv = transformUV(canvasRef!, vt);
      ctx.ellipse(uv[0], uv[1], 2, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const edge of state.obj.allEdges) {
      const uv1 = transformUV(canvasRef!, texVerts[edge[0] - 1]);
      const uv2 = transformUV(canvasRef!, texVerts[edge[1] - 1]);

      ctx.strokeStyle = "purple";
      ctx.beginPath();
      ctx.moveTo(uv1[0], uv1[1]);
      ctx.lineTo(uv2[0], uv2[1]);
      ctx.stroke();
    }

    for (const edge of state.obj.unaryEdges) {
      const uv1 = transformUV(canvasRef!, texVerts[edge[0] - 1]);
      const uv2 = transformUV(canvasRef!, texVerts[edge[1] - 1]);

      ctx.strokeStyle = "yellow";
      ctx.beginPath();
      ctx.moveTo(uv1[0], uv1[1]);
      ctx.lineTo(uv2[0], uv2[1]);
      ctx.stroke();
    }


    // const materials = Array.from(state.obj.materialFaces.keys());
    // const colors = ["red", "green", "blue", "purple", "orange", "yellow", "white"]
    // ctx.fillStyle = colors[materials.indexOf(material)];

    // ctx.clearRect(0, 0, canvasRef.width, canvasRef.height);
    // for (const data of idata) {
    //   ctx.putImageData(data, 0, 0);
    // }

    // const inside = classifyPoint(state.poly, [state.mouse.x, state.mouse.y]) <= 0;

    // ctx.fillStyle = inside ? "yellow" : "black";
    // ctx.beginPath();
    // ctx.ellipse(state.mouse.x, state.mouse.y, 4, 4, 0, 0, Math.PI * 2);
    // ctx.fill();
  }, [canvasRef]);

  const onMouseMove: React.MouseEventHandler = useCallback((e) => {
    if (!canvasRef) return;
    drawState.current.mouse = getMousePos(canvasRef, e);
  }, [canvasRef])

  const onClick: React.MouseEventHandler = useCallback((e) => {
    if (!canvasRef) return;
    const mouse = getMousePos(canvasRef, e);
    drawState.current.mouse = mouse;

    drawState.current.poly.push([ mouse.x, mouse.y ]);
  }, [canvasRef]);

  const textureMap = useRef(new Map<string | null, Map<string, typeof Image>>());

  const [materials, setMaterials] = useState<(string | null)[]>([]);
  const handleFile = async (file: RcFile, fileList: RcFile[]) => {
    const text = await file.text();
    if (file.name.endsWith(".obj")) {
      const res = processOBJ(text);
      drawState.current.obj = res;

      const mats = Array.from(res.materialFaces.keys());
      setMaterials(mats);
      textureMap.current.clear();
      for (const mat of mats) {
        textureMap.current.set(mat, new Map());
      }
    }

    return false;
  }

  const handleTexture = async (file: RcFile, fileList: RcFile[]) => {
    if (!file.type.startsWith("image")) return false;

    const [material, textureType] = path.basename(file.name, path.extname(file.name)).split("_");
    if (!textureType) return;

    const img = new Image();
    img.onload = () => {
      console.log("Loaded " + file.name);

      if (!drawState.current.textureSets.has(textureType)) {
        drawState.current.textureSets.set(textureType, new Map());
      }

      drawState.current.textureSets.get(textureType)!.set(material, img);
      drawState.current.textureSize = { width: img.width, height: img.height };

      setTextureCount(v => v + 1);
    }

    const buffer = await file.arrayBuffer();
    const blob = new Blob([buffer]);

    console.log(file.type);

    const reader = new FileReader();
    reader.onload = e => img.src = e.target!.result as string
    reader.readAsDataURL(blob);

    return false;
  }

  const [result, setResult] = useState<Map<string | null, {blob: Blob, data: string}>>(new Map());
  const [progress, setProgress] = useState(0);
  const fullRender = async () => {
    setProgress(0.01);

    const state = drawState.current;
    const renderer    = new OffscreenCanvas(state.textureSize.width, state.textureSize.height);
    const destination = new OffscreenCanvas(state.textureSize.width, state.textureSize.height);
    const destCtx     = destination.getContext("2d");
    if (!destCtx) return message.error("Unable to create render context");
    if (!state.obj) return;

    const results = new Map<string | null, {blob: Blob, data: string}>();

    let iterations = 1;
    for await (const [textureType, textures] of runYieldTasks(state.textureSets.entries())) {
      renderTexture(destCtx, renderer, state.obj, textures, textureType);

      // const texVerts = state.obj.texVerts
      // for (const vt of texVerts) {
      //   destCtx.fillStyle = "red";
      //   destCtx.beginPath();
      //   const uv = transformUV(destination, vt);
      //   destCtx.ellipse(uv[0], uv[1], 2, 2, 0, 0, Math.PI * 2);
      //   destCtx.fill();
      // }

      // for (const edge of state.obj.allEdges) {
      //   const uv1 = transformUV(destination, texVerts[edge[0] - 1]);
      //   const uv2 = transformUV(destination, texVerts[edge[1] - 1]);

      //   destCtx.strokeStyle = "purple";
      //   destCtx.beginPath();
      //   destCtx.moveTo(uv1[0], uv1[1]);
      //   destCtx.lineTo(uv2[0], uv2[1]);
      //   destCtx.stroke();
      // }

      // for (const edge of state.obj.unaryEdges) {
      //   const uv1 = transformUV(destination, texVerts[edge[0] - 1]);
      //   const uv2 = transformUV(destination, texVerts[edge[1] - 1]);

      //   destCtx.strokeStyle = "yellow";
      //   destCtx.beginPath();
      //   destCtx.moveTo(uv1[0], uv1[1]);
      //   destCtx.lineTo(uv2[0], uv2[1]);
      //   destCtx.stroke();
      // }




      const blob = await destination.convertToBlob({ type: "image/png" });
      results.set(textureType, { blob, data: URL.createObjectURL(blob) });

      setProgress(iterations++ / state.textureSets.size);
    }

    setResult(results);
  }

  const blobToBuffer: (blob: Blob) => Promise<Buffer> = (blob: Blob) => {
    return new Promise((resolve) => {
      let reader = new FileReader();
      reader.onload = function() {
        if (reader.readyState == 2) {
          resolve(Buffer.from(reader.result!));
        }
      }
      reader.readAsArrayBuffer(blob)
    });
  }

  const saveAll = async () => {
    const dir = await dialog.showOpenDialog({
      buttonLabel: "Save Files",
      title: "Directory to save files in",
      properties: ["openDirectory"]
    });

    const [dirPath] = dir.filePaths;
    if (!dirPath) return;

    for (const [textureType, image] of result) {
      fs.writeFile(path.join(dirPath, String(textureType) + ".png") + "", await blobToBuffer(image.blob))
    }
  }

  return (
    <div className="pane">
      <div className="flex-1">
        <Upload accept=".obj" beforeUpload={handleFile} maxCount={1}>
          <Button icon={<UploadOutlined />}>Upload Object</Button>
        </Upload>

        <Upload accept="image/*" multiple beforeUpload={handleTexture}>
          <Button icon={<UploadOutlined />} disabled={!drawState.current.obj}>Upload Textures</Button>
        </Upload>

        <div className="row">
          <Button className="mr-2" icon={<BuildOutlined />} disabled={textureCount === 0} onClick={fullRender}>Render</Button>
          <Progress percent={progress*100} />
        </div>

        { result.size > 0 && <div>
          <Carousel>
            { Array.from(result.values()).map(({ data }) => <img src={data} />) }
          </Carousel>

          <Button icon={<DownloadOutlined />} onClick={saveAll}>Save All</Button>
        </div> }
      </div>

      <div className="center">
        <canvas width={512} height={512} ref={r => setCanvasRef(r as HTMLCanvasElement)} onMouseMove={onMouseMove} onClick={onClick}/>
        <h2>Preview</h2>
      </div>

    </div>
  );
};

export default function App() {
  return (
    <Router>
      <Switch>
        <Route path="/" component={Hello} />
      </Switch>
    </Router>
  );
}
