








const WASM_DIR = new URL('../vendor/mediapipe/wasm', import.meta.url).href;



const MODELS = {
  scene: new URL('../vendor/models/blaze_face_full_range.tflite', import.meta.url).href,
};

let detecteur = null;
let mode = null;
let enCours = null;














let horloge = Date.now();
export const prochainInstant = () => ++horloge;

async function creer(modeVoulu, onProgress) {
  onProgress && onProgress('chargement du détecteur');
  const vision = await import('../vendor/mediapipe/vision_bundle.mjs');
  const fileset = await vision.FilesetResolver.forVisionTasks(WASM_DIR);
  let derniere = null;
  for (const delegate of ['GPU', 'CPU']) {
    try {
      const d = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELS.scene, delegate },
        runningMode: modeVoulu,





        minDetectionConfidence: 0.3,
      });
      return d;
    } catch (e) { derniere = e; }
  }
  throw derniere || new Error('détecteur indisponible');
}






function obtenir(modeVoulu, onProgress) {
  enCours = (enCours || Promise.resolve())
    .catch(() => {})
    .then(() => accesExclusif(modeVoulu, onProgress));
  return enCours;
}

async function accesExclusif(modeVoulu, onProgress) {
  if (!detecteur) {
    detecteur = await creer(modeVoulu, onProgress);
    mode = modeVoulu;
    return detecteur;
  }
  if (mode !== modeVoulu) {
    try {
      await detecteur.setOptions({ runningMode: modeVoulu });
      mode = modeVoulu;
    } catch (e) {


      try { detecteur.close && detecteur.close(); } catch (e2) {  }
      detecteur = null; mode = null;
      detecteur = await creer(modeVoulu, onProgress);
      mode = modeVoulu;
    }
  }
  return detecteur;
}

export const loadDetector = (onProgress) => obtenir('IMAGE', onProgress);
export const loadVideoDetector = (onProgress) => obtenir('VIDEO', onProgress);






export async function visagesBruts(canvas) {
  const det = await obtenir('IMAGE');
  const long = Math.max(canvas.width, canvas.height);
  const scale = Math.min(1, 1024 / long);
  let input = canvas;
  if (scale < 1) {
    input = document.createElement('canvas');
    input.width = Math.round(canvas.width * scale);
    input.height = Math.round(canvas.height * scale);
    input.getContext('2d').drawImage(canvas, 0, 0, input.width, input.height);
  }
  const inv = 1 / (scale || 1);
  return (det.detect(input).detections || []).map((d) => d.boundingBox).filter(Boolean)
    .map((b) => ({ x: b.originX * inv, y: b.originY * inv, w: b.width * inv, h: b.height * inv }));
}





















const MODELE_PERSONNES = new URL('../vendor/models/efficientdet_lite0.tflite', import.meta.url).href;
let objets = null;
let delegueTetes = null;
export const delegueDesTetes = () => delegueTetes;
let modeObjets = null;
let enCoursObjets = null;










const DELAI_MOTEUR = 20000;
function avecDelai(promesse, ms, quoi) {
  let minuteur;
  return Promise.race([
    promesse.finally(() => clearTimeout(minuteur)),
    new Promise((_, rejeter) => { minuteur = setTimeout(() => rejeter(new Error(quoi)), ms); }),
  ]);
}

async function creerObjets(modeVoulu, onProgress) {
  onProgress && onProgress('chargement du détecteur de têtes');
  const vision = await avecDelai(import('../vendor/mediapipe/vision_bundle.mjs'), DELAI_MOTEUR, 'le moteur de vision n’a pas répondu');
  const fileset = await avecDelai(vision.FilesetResolver.forVisionTasks(WASM_DIR), DELAI_MOTEUR, 'les fichiers du moteur n’ont pas répondu');
  let derniere = null;
  for (const delegate of ['GPU', 'CPU']) {
    try {
      const d = await avecDelai(vision.ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELE_PERSONNES, delegate },
        runningMode: modeVoulu,


        scoreThreshold: 0.3,
        categoryAllowlist: ['person'],
        maxResults: 40,
      }), DELAI_MOTEUR, `le détecteur de têtes n’a pas démarré sur ${delegate} en ${DELAI_MOTEUR / 1000} s`);



      delegueTetes = delegate;
      return d;
    } catch (e) { derniere = e; }
  }
  throw derniere || new Error('détecteur de têtes indisponible');
}


export function loadHeadDetector(modeVoulu = 'VIDEO', onProgress) {
  enCoursObjets = (enCoursObjets || Promise.resolve()).catch(() => {}).then(async () => {
    if (!objets) { objets = await creerObjets(modeVoulu, onProgress); modeObjets = modeVoulu; return objets; }
    if (modeObjets !== modeVoulu) {
      try { await objets.setOptions({ runningMode: modeVoulu }); modeObjets = modeVoulu; }
      catch (e) {
        try { objets.close && objets.close(); } catch (e2) {  }
        objets = null; modeObjets = null;
        objets = await creerObjets(modeVoulu, onProgress); modeObjets = modeVoulu;
      }
    }
    return objets;
  });
  return enCoursObjets;
}









