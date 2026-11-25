import { createMockMaterialSvg, createMockFigureSvg } from './mockSvg';

export const MOCK_HEALTH = {
  status: 'ok',
  model_loaded: true,
  classes: ['cardboard', 'glass', 'metal', 'paper', 'plastic', 'trash'],
  gpu: {
    available: true,
    name: 'NVIDIA RTX 4060 Laptop GPU (Demo)',
    vram_gb: 8.0,
  },
  live_generation: {
    available: true,
    reason: null,
  },
};

export const MOCK_EFFECTS = {
  axes: [
    {
      id: 'lighting',
      label: 'Lighting',
      effects: [
        { id: 'brightness_contrast', label: 'Brightness & contrast' },
        { id: 'shadow', label: 'Cast shadow' },
        { id: 'color_temperature', label: 'Color temperature' },
        { id: 'low_light', label: 'Low light' },
        { id: 'glare', label: 'Specular glare' },
      ],
    },
    {
      id: 'contamination',
      label: 'Contamination',
      effects: [
        { id: 'noise', label: 'Sensor noise' },
        { id: 'blur', label: 'Motion blur' },
        { id: 'occlusion_patches', label: 'Occlusion patches' },
        { id: 'stain_overlay', label: 'Residue stain' },
      ],
    },
    {
      id: 'condition',
      label: 'Material condition',
      effects: [
        { id: 'rotation', label: 'Conveyor rotation' },
        { id: 'perspective', label: 'Camera perspective' },
        { id: 'elastic', label: 'Elastic warp' },
        { id: 'crumple', label: 'Crumple & crease' },
        { id: 'partial_crop', label: 'Partial belt crop' },
      ],
    },
  ],
};

export function createMockRegistryAndFixtures() {
  const fileMap = new Map();

  function registerMockFile(path, dataUrl) {
    fileMap.set(path, dataUrl);
    return path;
  }

  // Seeded gallery items (30 items across 6 classes x 3 axes)
  const galleryItems = [];
  const classes = MOCK_HEALTH.classes;
  const axes = ['lighting', 'contamination', 'condition'];
  const prompts = {
    lighting: 'overhead sodium-vapor sorting line lighting with harsh conveyor shadows',
    contamination: 'damp food residue streaks and dust particles on recyclable surface',
    condition: 'crushed, creased, partially flattened item on moving sorting belt',
  };

  let idx = 1;
  for (let c = 0; c < classes.length; c += 1) {
    for (let a = 0; a < axes.length; a += 1) {
      for (let k = 0; k < 2; k += 1) {
        const cls = classes[c];
        const axis = axes[a];
        const id = `gen_${String(idx).padStart(3, '0')}`;
        const origPath = registerMockFile(
          `/files/mock/gallery/${id}_orig.svg`,
          createMockMaterialSvg({ cls, variantTag: 'ORIGINAL', seed: idx })
        );
        const genPath = registerMockFile(
          `/files/mock/gallery/${id}_gen.svg`,
          createMockMaterialSvg({ cls, variantTag: axis.toUpperCase(), axis, seed: idx + 100 })
        );
        galleryItems.push({
          id,
          class: cls,
          axis,
          mode: k % 2 === 0 ? 'img2img' : 'inpaint',
          strength: +(0.35 + ((idx * 7) % 30) / 100).toFixed(2),
          prompt: `${cls} on industrial conveyor, ${prompts[axis]}`,
          kept: idx % 5 !== 0,
          original_url: origPath,
          generated_url: genPath,
        });
        idx += 1;
      }
    }
  }

  // Seeded figures for /api/results
  const fig1Url = registerMockFile(
    '/files/mock/figures/confusion_matrix.svg',
    createMockFigureSvg({
      title: 'Normalized Confusion Matrix — TACO Field Eval',
      subtitle: 'SortAugment Full (Lighting + Contamination + Condition)',
      kind: 'confusion',
    })
  );
  const fig2Url = registerMockFile(
    '/files/mock/figures/robustness_curve.svg',
    createMockFigureSvg({
      title: 'Accuracy vs. Perturbation Severity',
      subtitle: 'Mean across 3 facility stress axes',
      kind: 'curve',
    })
  );

  const results = {
    source: 'Demo evaluation suite (synthetic placeholder metrics — connect backend for real benchmarks)',
    models: [
      {
        id: 'baseline_resnet',
        name: 'Baseline ResNet-50',
        description: 'Trained on standard TrashNet split with basic horizontal flip only.',
        trashnet: { accuracy: 0.912, macro_f1: 0.904 },
        taco: { accuracy: 0.614, macro_f1: 0.582, ci_low: 0.579, ci_high: 0.649 },
        robustness: { lighting: 0.642, contamination: 0.558, condition: 0.601, mean: 0.600 },
      },
      {
        id: 'classic_aug',
        name: 'ResNet-50 + Classic Aug',
        description: 'Adds standard jitter and random crop during training.',
        trashnet: { accuracy: 0.924, macro_f1: 0.918 },
        taco: { accuracy: 0.678, macro_f1: 0.651, ci_low: 0.644, ci_high: 0.712 },
        robustness: { lighting: 0.728, contamination: 0.631, condition: 0.684, mean: 0.681 },
      },
      {
        id: 'sortaugment_classical',
        name: 'SortAugment Pipeline',
        description: 'Trained with domain-tuned lighting, contamination, and material-condition transforms.',
        trashnet: { accuracy: 0.938, macro_f1: 0.933 },
        taco: { accuracy: 0.742, macro_f1: 0.719, ci_low: 0.709, ci_high: 0.774 },
        robustness: { lighting: 0.816, contamination: 0.749, condition: 0.782, mean: 0.782 },
      },
      {
        id: 'sortaugment_hybrid',
        name: 'SortAugment + Gen Hybrid',
        description: 'Combines deterministic transforms with filtered img2img/inpaint variants.',
        trashnet: { accuracy: 0.941, macro_f1: null },
        taco: { accuracy: 0.768, macro_f1: 0.744, ci_low: 0.735, ci_high: 0.799 },
        robustness: { lighting: 0.834, contamination: 0.791, condition: 0.806, mean: 0.810 },
      },
    ],
    notes: [
      'Cross-domain TACO accuracy improves by +15.4 percentage points over the unaugmented baseline when lighting, contamination, and material deformation are simulated together.',
      'Contamination (residue stains and occlusion patches) accounts for the sharpest baseline drop on real sorting belts and benefits most from targeted overlays.',
      'All figures shown here are demonstration values generated in offline mock mode; switch VITE_USE_MOCK=false to load live evaluation artifacts from your backend.',
    ],
    figures: [
      { title: 'Normalized Confusion Matrix (TACO Eval)', url: fig1Url },
      { title: 'Robustness Across Perturbation Severity', url: fig2Url },
    ],
  };

  // Pre-seeded completed job so Classifier Check & Export work immediately in demo mode
  const seedJobId = 'job_demo_001';
  const seedSources = [
    { name: 'belt_pet_014.jpg', label: 'plastic', cls: 'plastic', seed: 11 },
    { name: 'belt_corrugated_029.jpg', label: 'cardboard', cls: 'cardboard', seed: 22 },
    { name: 'belt_soda_can_083.jpg', label: 'metal', cls: 'metal', seed: 33 },
  ].map((item, sIdx) => {
    const sourceId = `src_${sIdx + 1}`;
    const origUrl = registerMockFile(
      `/files/mock/jobs/${seedJobId}/${sourceId}_orig.svg`,
      createMockMaterialSvg({ cls: item.cls, variantTag: 'ORIGINAL', seed: item.seed })
    );
    const variants = [
      { axis: 'lighting', effect: 'low_light', params: { brightness: 0.56, gamma: 1.42 } },
      { axis: 'contamination', effect: 'stain_overlay', params: { stain_spots: 5, opacity: 0.44 } },
      { axis: 'condition', effect: 'crumple', params: { folds: 5 } },
    ].map((v, vIdx) => {
      const variantId = `${sourceId}_v${vIdx + 1}`;
      const varUrl = registerMockFile(
        `/files/mock/jobs/${seedJobId}/${variantId}.svg`,
        createMockMaterialSvg({
          cls: item.cls,
          variantTag: v.effect.toUpperCase(),
          axis: v.axis,
          seed: item.seed + vIdx + 1,
        })
      );
      return {
        variant_id: variantId,
        url: varUrl,
        axis: v.axis,
        effect: v.effect,
        params: v.params,
      };
    });

    return {
      source_id: sourceId,
      name: item.name,
      label: item.label,
      url: origUrl,
      variants,
    };
  });

  const seededJob = {
    job_id: seedJobId,
    type: 'augment',
    status: 'done',
    created_at: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    seed: 2026,
    progress: { done: 9, total: 9 },
    eta_seconds: 0,
    error: null,
    result: { sources: seedSources },
  };

  return {
    fileMap,
    registerMockFile,
    galleryItems,
    results,
    seededJob,
  };
}