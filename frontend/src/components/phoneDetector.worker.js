// Runs the phone detector off the main thread, so the screen stays smooth even on a computer without a fast GPU.
// Frames arrive as ImageData from the camera guard; only a score comes back. Nothing leaves this computer.
import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-webgl'
import '@tensorflow/tfjs-backend-cpu'
import * as cocoSsd from '@tensorflow-models/coco-ssd'

let model = null

async function init() {
  try {
    if (!(await tf.setBackend('webgl').catch(() => false))) await tf.setBackend('cpu')
    await tf.ready()
    model = await cocoSsd.load({ base: 'lite_mobilenet_v2' })
    self.postMessage({ type: 'ready', backend: tf.getBackend() })
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e?.message ?? e) })
  }
}
init()

self.onmessage = async ({ data }) => {
  if (data?.type !== 'frame') return
  if (!model) { self.postMessage({ type: 'result', phone: 0, ms: 0 }); return }
  const t0 = performance.now()
  let phone = 0
  try {
    const found = await model.detect(data.frame, 8, 0.3)
    phone = Math.max(0, ...found.filter((d) => d.class === 'cell phone').map((d) => d.score))
  } catch { /* a bad frame; the next one will do */ }
  self.postMessage({ type: 'result', phone, ms: Math.round(performance.now() - t0), backend: tf.getBackend() })
}
