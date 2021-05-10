export async function* runYieldTasks<T>(tasks: Iterable<T>, delay: number = 10): AsyncGenerator<T, void, void> {
  for (const task of tasks) {
    yield task;

    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

export function calcPolygonArea(vertices: number[][]) {
  let total = 0;

  for (let i = 0, l = vertices.length; i < l; i++) {
    const addX = vertices[i][0];
    const addY = vertices[i == vertices.length - 1 ? 0 : i + 1][1];
    const subX = vertices[i == vertices.length - 1 ? 0 : i + 1][0];
    const subY = vertices[i][1];

    total += (addX * addY * 0.5);
    total -= (subX * subY * 0.5);
  }

  return Math.abs(total);
}

export function meanPoint(vertices: number[][]) {
  let x = 0;
  let y = 0;
  for (const vertex of vertices) {
    x += vertex[0];
    y += vertex[1];
  }

  return [x / vertices.length, y / vertices.length];
}
