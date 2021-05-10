import { calcPolygonArea, meanPoint } from "./util";

export function processOBJ(obj: string) {
  const lines = obj.split("\n");

  const edgeSet = new Set<string>();
  const doubleSet = new Set<string>();

  const allEdges = [];
  const texVerts = [];
  const allFaces = [];

  const materialFaces = new Map<string | null, number[][]>();

  let currentMaterial = null;
  for (const line of lines) {
    const comps = line.split(" ");
    if (comps[0] === "usemtl") {
      currentMaterial = comps[1];
      if (!materialFaces.has(currentMaterial)) {
        materialFaces.set(currentMaterial, []);
      }
    } else if (comps[0] === "f") {
      const texNodes = comps.slice(1).map(x => parseInt(x.split("/")[1], 10));
      allFaces.push(texNodes);
      materialFaces.get(currentMaterial)!.push(texNodes);

      for (let i = 0; i < texNodes.length; i++) {
        const stNode = texNodes[i];
        const eNode = texNodes[i + 1] ?? texNodes[0];

        const edge = stNode > eNode ? eNode + "," + stNode : stNode + "," + eNode;
        if (edgeSet.has(edge)) {
          doubleSet.add(edge);
        } else {
          edgeSet.add(edge);
        }

        allEdges.push([stNode, eNode]);
      }
    } else if (comps[0] === "vt") {
      texVerts.push(comps.slice(1).map(x => parseFloat(x)));
    }
  }

  const unaryEdgeSet = new Set(
    [...edgeSet].filter(x => !doubleSet.has(x)));

  const unaryEdges = Array.from(unaryEdgeSet).map(p => p.split(",").map(v => parseInt(v, 10)));

  return {
    texVerts, unaryEdges, allEdges, allFaces, materialFaces
  }
}

export type OBJ = ReturnType<typeof processOBJ>

export function transformUV(canvas: HTMLCanvasElement | OffscreenCanvas, uv: number[]) {
  return [uv[0] * canvas.width, (1 - uv[1]) * canvas.height];
}

export function generateCutout(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, object: OBJ, material: string | null, image: HTMLImageElement) {
  const canvas = ctx.canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const edges = object.materialFaces.get(material)!;

  ctx.fillStyle = "white";
  ctx.strokeStyle = "white";
  ctx.lineWidth = 5;
  ctx.lineJoin = "round";

  for (const edge of edges) {
    const uvs = edge.map(v => transformUV(canvas, object.texVerts[v - 1]));

    ctx.beginPath();
    ctx.moveTo(uvs[0][0], uvs[0][1]);
    for (let i = 1; i < uvs.length; i++) {
      ctx.lineTo(uvs[i][0], uvs[i][1]);
    }
    ctx.stroke();
    ctx.fill();

    const area = calcPolygonArea(uvs);
    if (area < canvas.width / 32) {
      ctx.beginPath();

      const [mx, my] = meanPoint(uvs);
      const r = Math.sqrt(area) + (canvas.width / 128);
      ctx.ellipse(mx, my, r, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = "source-atop";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "source-over";
}

export function renderTexture(
  destCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  tempCanvas: OffscreenCanvas,
  object: OBJ,
  textures: Map<string | null, HTMLImageElement>,
  textureType: string,
) {
  const canvas = destCtx.canvas;
  if (textureType === "normal") {
    destCtx.fillStyle = "#8080FF";
  } else {
    destCtx.fillStyle = "#000000";
  }
  destCtx.fillRect(0, 0, canvas.width, canvas.height);

  for (const [material] of object.materialFaces) {
    const image = textures.get(material);
    if (image) {
      const octx = tempCanvas.getContext("2d");
      if (!octx) return;

      generateCutout(octx, object, material, image);
      destCtx.drawImage(tempCanvas, 0, 0);
    }
  }
}
