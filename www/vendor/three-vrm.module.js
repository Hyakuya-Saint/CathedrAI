// packages/three-vrm-core/src/expressions/VRMExpression.ts
import * as THREE from "three";

class VRMExpression extends THREE.Object3D {
  expressionName;
  weight = 0;
  isBinary = false;
  overrideBlink = "none";
  overrideLookAt = "none";
  overrideMouth = "none";
  _binds = [];
  type;
  get overrideBlinkAmount() {
    if (this.overrideBlink === "block") {
      return 0 < this.weight ? 1 : 0;
    } else if (this.overrideBlink === "blend") {
      return this.weight;
    } else {
      return 0;
    }
  }
  get overrideLookAtAmount() {
    if (this.overrideLookAt === "block") {
      return 0 < this.weight ? 1 : 0;
    } else if (this.overrideLookAt === "blend") {
      return this.weight;
    } else {
      return 0;
    }
  }
  get overrideMouthAmount() {
    if (this.overrideMouth === "block") {
      return 0 < this.weight ? 1 : 0;
    } else if (this.overrideMouth === "blend") {
      return this.weight;
    } else {
      return 0;
    }
  }
  constructor(expressionName) {
    super();
    this.name = `VRMExpression_${expressionName}`;
    this.expressionName = expressionName;
    this.type = "VRMExpression";
    this.visible = false;
  }
  addBind(bind) {
    this._binds.push(bind);
  }
  applyWeight(options) {
    let actualWeight = this.isBinary ? this.weight <= 0.5 ? 0 : 1 : this.weight;
    actualWeight *= options?.multiplier ?? 1;
    this._binds.forEach((bind) => bind.applyWeight(actualWeight));
  }
  clearAppliedWeight() {
    this._binds.forEach((bind) => bind.clearAppliedWeight());
  }
}
// packages/three-vrm-core/src/expressions/VRMExpressionLoaderPlugin.ts
import * as THREE4 from "three";

// packages/three-vrm-core/src/utils/gltfExtractPrimitivesFromNode.ts
function extractPrimitivesInternal(gltf, nodeIndex, node) {
  const json = gltf.parser.json;
  const schemaNode = json.nodes?.[nodeIndex];
  if (schemaNode == null) {
    console.warn(`extractPrimitivesInternal: Attempt to use nodes[${nodeIndex}] of glTF but the node doesn't exist`);
    return null;
  }
  const meshIndex = schemaNode.mesh;
  if (meshIndex == null) {
    return null;
  }
  const schemaMesh = json.meshes?.[meshIndex];
  if (schemaMesh == null) {
    console.warn(`extractPrimitivesInternal: Attempt to use meshes[${meshIndex}] of glTF but the mesh doesn't exist`);
    return null;
  }
  const primitiveCount = schemaMesh.primitives.length;
  const primitives = [];
  node.traverse((object) => {
    if (primitives.length < primitiveCount) {
      if (object.isMesh) {
        primitives.push(object);
      }
    }
  });
  return primitives;
}
async function gltfExtractPrimitivesFromNode(gltf, nodeIndex) {
  const node = await gltf.parser.getDependency("node", nodeIndex);
  return extractPrimitivesInternal(gltf, nodeIndex, node);
}
async function gltfExtractPrimitivesFromNodes(gltf) {
  const nodes = await gltf.parser.getDependencies("node");
  const map = new Map;
  nodes.forEach((node, index) => {
    const result = extractPrimitivesInternal(gltf, index, node);
    if (result != null) {
      map.set(index, result);
    }
  });
  return map;
}

// packages/three-vrm-core/src/expressions/VRMExpressionPresetName.ts
var VRMExpressionPresetName = {
  Aa: "aa",
  Ih: "ih",
  Ou: "ou",
  Ee: "ee",
  Oh: "oh",
  Blink: "blink",
  Happy: "happy",
  Angry: "angry",
  Sad: "sad",
  Relaxed: "relaxed",
  LookUp: "lookUp",
  Surprised: "surprised",
  LookDown: "lookDown",
  LookLeft: "lookLeft",
  LookRight: "lookRight",
  BlinkLeft: "blinkLeft",
  BlinkRight: "blinkRight",
  Neutral: "neutral"
};

// packages/three-vrm-core/src/utils/saturate.ts
function saturate(value) {
  return Math.max(Math.min(value, 1), 0);
}

// packages/three-vrm-core/src/expressions/VRMExpressionManager.ts
class VRMExpressionManager {
  blinkExpressionNames = ["blink", "blinkLeft", "blinkRight"];
  lookAtExpressionNames = ["lookLeft", "lookRight", "lookUp", "lookDown"];
  mouthExpressionNames = ["aa", "ee", "ih", "oh", "ou"];
  _expressions = [];
  get expressions() {
    return this._expressions.concat();
  }
  _expressionMap = {};
  get expressionMap() {
    return Object.assign({}, this._expressionMap);
  }
  get presetExpressionMap() {
    const result = {};
    const presetNameSet = new Set(Object.values(VRMExpressionPresetName));
    Object.entries(this._expressionMap).forEach(([name, expression]) => {
      if (presetNameSet.has(name)) {
        result[name] = expression;
      }
    });
    return result;
  }
  get customExpressionMap() {
    const result = {};
    const presetNameSet = new Set(Object.values(VRMExpressionPresetName));
    Object.entries(this._expressionMap).forEach(([name, expression]) => {
      if (!presetNameSet.has(name)) {
        result[name] = expression;
      }
    });
    return result;
  }
  constructor() {}
  copy(source) {
    const expressions = this._expressions.concat();
    expressions.forEach((expression) => {
      this.unregisterExpression(expression);
    });
    source._expressions.forEach((expression) => {
      this.registerExpression(expression);
    });
    this.blinkExpressionNames = source.blinkExpressionNames.concat();
    this.lookAtExpressionNames = source.lookAtExpressionNames.concat();
    this.mouthExpressionNames = source.mouthExpressionNames.concat();
    return this;
  }
  clone() {
    return new VRMExpressionManager().copy(this);
  }
  getExpression(name) {
    return this._expressionMap[name] ?? null;
  }
  registerExpression(expression) {
    this._expressions.push(expression);
    this._expressionMap[expression.expressionName] = expression;
  }
  unregisterExpression(expression) {
    const index = this._expressions.indexOf(expression);
    if (index === -1) {
      console.warn("VRMExpressionManager: The specified expressions is not registered");
    }
    this._expressions.splice(index, 1);
    delete this._expressionMap[expression.expressionName];
  }
  getValue(name) {
    const expression = this.getExpression(name);
    return expression?.weight ?? null;
  }
  setValue(name, weight) {
    const expression = this.getExpression(name);
    if (expression) {
      expression.weight = saturate(weight);
    }
  }
  resetValues() {
    this._expressions.forEach((expression) => {
      expression.weight = 0;
    });
  }
  getExpressionTrackName(name) {
    const expression = this.getExpression(name);
    return expression ? `${expression.name}.weight` : null;
  }
  update() {
    const weightMultipliers = this._calculateWeightMultipliers();
    this._expressions.forEach((expression) => {
      expression.clearAppliedWeight();
    });
    this._expressions.forEach((expression) => {
      let multiplier = 1;
      const name = expression.expressionName;
      if (this.blinkExpressionNames.indexOf(name) !== -1) {
        multiplier *= weightMultipliers.blink;
      }
      if (this.lookAtExpressionNames.indexOf(name) !== -1) {
        multiplier *= weightMultipliers.lookAt;
      }
      if (this.mouthExpressionNames.indexOf(name) !== -1) {
        multiplier *= weightMultipliers.mouth;
      }
      expression.applyWeight({ multiplier });
    });
  }
  _calculateWeightMultipliers() {
    let blink = 1;
    let lookAt = 1;
    let mouth = 1;
    this._expressions.forEach((expression) => {
      blink -= expression.overrideBlinkAmount;
      lookAt -= expression.overrideLookAtAmount;
      mouth -= expression.overrideMouthAmount;
    });
    blink = Math.max(0, blink);
    lookAt = Math.max(0, lookAt);
    mouth = Math.max(0, mouth);
    return { blink, lookAt, mouth };
  }
}

// packages/three-vrm-core/src/expressions/VRMExpressionMaterialColorType.ts
var VRMExpressionMaterialColorType = {
  Color: "color",
  EmissionColor: "emissionColor",
  ShadeColor: "shadeColor",
  MatcapColor: "matcapColor",
  RimColor: "rimColor",
  OutlineColor: "outlineColor"
};
var v0ExpressionMaterialColorMap = {
  _Color: VRMExpressionMaterialColorType.Color,
  _EmissionColor: VRMExpressionMaterialColorType.EmissionColor,
  _ShadeColor: VRMExpressionMaterialColorType.ShadeColor,
  _RimColor: VRMExpressionMaterialColorType.RimColor,
  _OutlineColor: VRMExpressionMaterialColorType.OutlineColor
};

// packages/three-vrm-core/src/expressions/VRMExpressionMaterialColorBind.ts
import * as THREE2 from "three";
var _color = new THREE2.Color;

class VRMExpressionMaterialColorBind {
  static _propertyNameMapMap = {
    isMeshStandardMaterial: {
      color: ["color", "opacity"],
      emissionColor: ["emissive", null]
    },
    isMeshBasicMaterial: {
      color: ["color", "opacity"]
    },
    isMToonMaterial: {
      color: ["color", "opacity"],
      emissionColor: ["emissive", null],
      outlineColor: ["outlineColorFactor", null],
      matcapColor: ["matcapFactor", null],
      rimColor: ["parametricRimColorFactor", null],
      shadeColor: ["shadeColorFactor", null]
    }
  };
  material;
  type;
  targetValue;
  targetAlpha;
  _state;
  constructor({
    material,
    type,
    targetValue,
    targetAlpha
  }) {
    this.material = material;
    this.type = type;
    this.targetValue = targetValue;
    this.targetAlpha = targetAlpha ?? 1;
    const color = this._initColorBindState();
    const alpha = this._initAlphaBindState();
    this._state = { color, alpha };
  }
  applyWeight(weight) {
    const { color, alpha } = this._state;
    if (color != null) {
      const { propertyName, deltaValue } = color;
      const target = this.material[propertyName];
      if (target != null) {
        target.add(_color.copy(deltaValue).multiplyScalar(weight));
      }
    }
    if (alpha != null) {
      const { propertyName, deltaValue } = alpha;
      const target = this.material[propertyName];
      if (target != null) {
        this.material[propertyName] += deltaValue * weight;
      }
    }
  }
  clearAppliedWeight() {
    const { color, alpha } = this._state;
    if (color != null) {
      const { propertyName, initialValue } = color;
      const target = this.material[propertyName];
      if (target != null) {
        target.copy(initialValue);
      }
    }
    if (alpha != null) {
      const { propertyName, initialValue } = alpha;
      const target = this.material[propertyName];
      if (target != null) {
        this.material[propertyName] = initialValue;
      }
    }
  }
  _initColorBindState() {
    const { material, type, targetValue } = this;
    const propertyNameMap = this._getPropertyNameMap();
    const propertyName = propertyNameMap?.[type]?.[0] ?? null;
    if (propertyName == null) {
      console.warn(`Tried to add a material color bind to the material ${material.name ?? "(no name)"}, the type ${type} but the material or the type is not supported.`);
      return null;
    }
    const target = material[propertyName];
    const initialValue = target.clone();
    const deltaValue = new THREE2.Color(targetValue.r - initialValue.r, targetValue.g - initialValue.g, targetValue.b - initialValue.b);
    return { propertyName, initialValue, deltaValue };
  }
  _initAlphaBindState() {
    const { material, type, targetAlpha } = this;
    const propertyNameMap = this._getPropertyNameMap();
    const propertyName = propertyNameMap?.[type]?.[1] ?? null;
    if (propertyName == null && targetAlpha !== 1) {
      console.warn(`Tried to add a material alpha bind to the material ${material.name ?? "(no name)"}, the type ${type} but the material or the type does not support alpha.`);
      return null;
    }
    if (propertyName == null) {
      return null;
    }
    const initialValue = material[propertyName];
    const deltaValue = targetAlpha - initialValue;
    return { propertyName, initialValue, deltaValue };
  }
  _getPropertyNameMap() {
    return Object.entries(VRMExpressionMaterialColorBind._propertyNameMapMap).find(([distinguisher]) => {
      return this.material[distinguisher] === true;
    })?.[1] ?? null;
  }
}

// packages/three-vrm-core/src/expressions/VRMExpressionMorphTargetBind.ts
class VRMExpressionMorphTargetBind {
  primitives;
  index;
  weight;
  constructor({
    primitives,
    index,
    weight
  }) {
    this.primitives = primitives;
    this.index = index;
    this.weight = weight;
  }
  applyWeight(weight) {
    this.primitives.forEach((mesh) => {
      if (mesh.morphTargetInfluences?.[this.index] != null) {
        mesh.morphTargetInfluences[this.index] += this.weight * weight;
      }
    });
  }
  clearAppliedWeight() {
    this.primitives.forEach((mesh) => {
      if (mesh.morphTargetInfluences?.[this.index] != null) {
        mesh.morphTargetInfluences[this.index] = 0;
      }
    });
  }
}

// packages/three-vrm-core/src/expressions/VRMExpressionTextureTransformBind.ts
import * as THREE3 from "three";
var _v2 = new THREE3.Vector2;

class VRMExpressionTextureTransformBind {
  static _propertyNamesMap = {
    isMeshStandardMaterial: [
      "map",
      "emissiveMap",
      "bumpMap",
      "normalMap",
      "displacementMap",
      "roughnessMap",
      "metalnessMap",
      "alphaMap"
    ],
    isMeshBasicMaterial: ["map", "specularMap", "alphaMap"],
    isMToonMaterial: [
      "map",
      "normalMap",
      "emissiveMap",
      "shadeMultiplyTexture",
      "rimMultiplyTexture",
      "outlineWidthMultiplyTexture",
      "uvAnimationMaskTexture"
    ]
  };
  material;
  scale;
  offset;
  _properties;
  constructor({
    material,
    scale,
    offset
  }) {
    this.material = material;
    this.scale = scale;
    this.offset = offset;
    const propertyNames = Object.entries(VRMExpressionTextureTransformBind._propertyNamesMap).find(([distinguisher]) => {
      return material[distinguisher] === true;
    })?.[1];
    if (propertyNames == null) {
      console.warn(`Tried to add a texture transform bind to the material ${material.name ?? "(no name)"} but the material is not supported.`);
      this._properties = [];
    } else {
      this._properties = [];
      propertyNames.forEach((propertyName) => {
        const texture = material[propertyName]?.clone();
        if (!texture) {
          return null;
        }
        material[propertyName] = texture;
        const initialOffset = texture.offset.clone();
        const initialScale = texture.repeat.clone();
        const deltaOffset = offset.clone().sub(initialOffset);
        const deltaScale = scale.clone().sub(initialScale);
        this._properties.push({
          name: propertyName,
          initialOffset,
          deltaOffset,
          initialScale,
          deltaScale
        });
      });
    }
  }
  applyWeight(weight) {
    this._properties.forEach((property) => {
      const target = this.material[property.name];
      if (target === undefined) {
        return;
      }
      target.offset.add(_v2.copy(property.deltaOffset).multiplyScalar(weight));
      target.repeat.add(_v2.copy(property.deltaScale).multiplyScalar(weight));
    });
  }
  clearAppliedWeight() {
    this._properties.forEach((property) => {
      const target = this.material[property.name];
      if (target === undefined) {
        return;
      }
      target.offset.copy(property.initialOffset);
      target.repeat.copy(property.initialScale);
    });
  }
}

// packages/three-vrm-core/src/expressions/VRMExpressionLoaderPlugin.ts
var POSSIBLE_SPEC_VERSIONS = new Set(["1.0", "1.0-beta"]);

class VRMExpressionLoaderPlugin {
  static v0v1PresetNameMap = {
    a: "aa",
    e: "ee",
    i: "ih",
    o: "oh",
    u: "ou",
    blink: "blink",
    joy: "happy",
    angry: "angry",
    sorrow: "sad",
    fun: "relaxed",
    lookup: "lookUp",
    lookdown: "lookDown",
    lookleft: "lookLeft",
    lookright: "lookRight",
    blink_l: "blinkLeft",
    blink_r: "blinkRight",
    neutral: "neutral"
  };
  parser;
  get name() {
    return "VRMExpressionLoaderPlugin";
  }
  constructor(parser) {
    this.parser = parser;
  }
  async afterRoot(gltf) {
    gltf.userData.vrmExpressionManager = await this._import(gltf);
  }
  async _import(gltf) {
    const v1Result = await this._v1Import(gltf);
    if (v1Result) {
      return v1Result;
    }
    const v0Result = await this._v0Import(gltf);
    if (v0Result) {
      return v0Result;
    }
    return null;
  }
  async _v1Import(gltf) {
    const json = this.parser.json;
    const isVRMUsed = json.extensionsUsed?.indexOf("VRMC_vrm") !== -1;
    if (!isVRMUsed) {
      return null;
    }
    const extension = json.extensions?.["VRMC_vrm"];
    if (!extension) {
      return null;
    }
    const specVersion = extension.specVersion;
    if (!POSSIBLE_SPEC_VERSIONS.has(specVersion)) {
      console.warn(`VRMExpressionLoaderPlugin: Unknown VRMC_vrm specVersion "${specVersion}"`);
      return null;
    }
    const schemaExpressions = extension.expressions;
    if (!schemaExpressions) {
      return null;
    }
    const presetNameSet = new Set(Object.values(VRMExpressionPresetName));
    const nameSchemaExpressionMap = new Map;
    if (schemaExpressions.preset != null) {
      Object.entries(schemaExpressions.preset).forEach(([name, schemaExpression]) => {
        if (schemaExpression == null) {
          return;
        }
        if (!presetNameSet.has(name)) {
          console.warn(`VRMExpressionLoaderPlugin: Unknown preset name "${name}" detected. Ignoring the expression`);
          return;
        }
        nameSchemaExpressionMap.set(name, schemaExpression);
      });
    }
    if (schemaExpressions.custom != null) {
      Object.entries(schemaExpressions.custom).forEach(([name, schemaExpression]) => {
        if (presetNameSet.has(name)) {
          console.warn(`VRMExpressionLoaderPlugin: Custom expression cannot have preset name "${name}". Ignoring the expression`);
          return;
        }
        nameSchemaExpressionMap.set(name, schemaExpression);
      });
    }
    const manager = new VRMExpressionManager;
    await Promise.all(Array.from(nameSchemaExpressionMap.entries()).map(async ([name, schemaExpression]) => {
      const expression = new VRMExpression(name);
      gltf.scene.add(expression);
      expression.isBinary = schemaExpression.isBinary ?? false;
      expression.overrideBlink = schemaExpression.overrideBlink ?? "none";
      expression.overrideLookAt = schemaExpression.overrideLookAt ?? "none";
      expression.overrideMouth = schemaExpression.overrideMouth ?? "none";
      schemaExpression.morphTargetBinds?.forEach(async (bind) => {
        if (bind.node === undefined || bind.index === undefined) {
          return;
        }
        const primitives = await gltfExtractPrimitivesFromNode(gltf, bind.node);
        const morphTargetIndex = bind.index;
        if (!primitives.every((primitive) => Array.isArray(primitive.morphTargetInfluences) && morphTargetIndex < primitive.morphTargetInfluences.length)) {
          console.warn(`VRMExpressionLoaderPlugin: ${schemaExpression.name} attempts to index morph #${morphTargetIndex} but not found.`);
          return;
        }
        expression.addBind(new VRMExpressionMorphTargetBind({
          primitives,
          index: morphTargetIndex,
          weight: bind.weight ?? 1
        }));
      });
      if (schemaExpression.materialColorBinds || schemaExpression.textureTransformBinds) {
        const gltfMaterials = [];
        gltf.scene.traverse((object) => {
          const material = object.material;
          if (material) {
            gltfMaterials.push(material);
          }
        });
        schemaExpression.materialColorBinds?.forEach(async (bind) => {
          const materials = gltfMaterials.filter((material) => {
            const materialIndex = this.parser.associations.get(material)?.materials;
            return bind.material === materialIndex;
          });
          materials.forEach((material) => {
            expression.addBind(new VRMExpressionMaterialColorBind({
              material,
              type: bind.type,
              targetValue: new THREE4.Color().fromArray(bind.targetValue),
              targetAlpha: bind.targetValue[3]
            }));
          });
        });
        schemaExpression.textureTransformBinds?.forEach(async (bind) => {
          const materials = gltfMaterials.filter((material) => {
            const materialIndex = this.parser.associations.get(material)?.materials;
            return bind.material === materialIndex;
          });
          materials.forEach((material) => {
            expression.addBind(new VRMExpressionTextureTransformBind({
              material,
              offset: new THREE4.Vector2().fromArray(bind.offset ?? [0, 0]),
              scale: new THREE4.Vector2().fromArray(bind.scale ?? [1, 1])
            }));
          });
        });
      }
      manager.registerExpression(expression);
    }));
    return manager;
  }
  async _v0Import(gltf) {
    const json = this.parser.json;
    const vrmExt = json.extensions?.VRM;
    if (!vrmExt) {
      return null;
    }
    const schemaBlendShape = vrmExt.blendShapeMaster;
    if (!schemaBlendShape) {
      return null;
    }
    const manager = new VRMExpressionManager;
    const schemaBlendShapeGroups = schemaBlendShape.blendShapeGroups;
    if (!schemaBlendShapeGroups) {
      return manager;
    }
    const blendShapeNameSet = new Set;
    await Promise.all(schemaBlendShapeGroups.map(async (schemaGroup) => {
      const v0PresetName = schemaGroup.presetName;
      const v1PresetName = v0PresetName != null && VRMExpressionLoaderPlugin.v0v1PresetNameMap[v0PresetName] || null;
      const name = v1PresetName ?? schemaGroup.name;
      if (name == null) {
        console.warn("VRMExpressionLoaderPlugin: One of custom expressions has no name. Ignoring the expression");
        return;
      }
      if (blendShapeNameSet.has(name)) {
        console.warn(`VRMExpressionLoaderPlugin: An expression preset ${v0PresetName} has duplicated entries. Ignoring the expression`);
        return;
      }
      blendShapeNameSet.add(name);
      const expression = new VRMExpression(name);
      gltf.scene.add(expression);
      expression.isBinary = schemaGroup.isBinary ?? false;
      if (schemaGroup.binds) {
        schemaGroup.binds.forEach(async (bind) => {
          if (bind.mesh === undefined || bind.index === undefined) {
            return;
          }
          const nodesUsingMesh = [];
          json.nodes?.forEach((node, i) => {
            if (node.mesh === bind.mesh) {
              nodesUsingMesh.push(i);
            }
          });
          const morphTargetIndex = bind.index;
          await Promise.all(nodesUsingMesh.map(async (nodeIndex) => {
            const primitives = await gltfExtractPrimitivesFromNode(gltf, nodeIndex);
            if (!primitives.every((primitive) => Array.isArray(primitive.morphTargetInfluences) && morphTargetIndex < primitive.morphTargetInfluences.length)) {
              console.warn(`VRMExpressionLoaderPlugin: ${schemaGroup.name} attempts to index ${morphTargetIndex}th morph but not found.`);
              return;
            }
            expression.addBind(new VRMExpressionMorphTargetBind({
              primitives,
              index: morphTargetIndex,
              weight: 0.01 * (bind.weight ?? 100)
            }));
          }));
        });
      }
      const materialValues = schemaGroup.materialValues;
      if (materialValues && materialValues.length !== 0) {
        materialValues.forEach((materialValue) => {
          if (materialValue.materialName === undefined || materialValue.propertyName === undefined || materialValue.targetValue === undefined) {
            return;
          }
          const materials = [];
          gltf.scene.traverse((object) => {
            if (object.material) {
              const material = object.material;
              if (Array.isArray(material)) {
                materials.push(...material.filter((mtl) => (mtl.name === materialValue.materialName || mtl.name === materialValue.materialName + " (Outline)") && materials.indexOf(mtl) === -1));
              } else if (material.name === materialValue.materialName && materials.indexOf(material) === -1) {
                materials.push(material);
              }
            }
          });
          const materialPropertyName = materialValue.propertyName;
          materials.forEach((material) => {
            if (materialPropertyName === "_MainTex_ST") {
              const scale = new THREE4.Vector2(materialValue.targetValue[0], materialValue.targetValue[1]);
              const offset = new THREE4.Vector2(materialValue.targetValue[2], materialValue.targetValue[3]);
              offset.y = 1 - offset.y - scale.y;
              expression.addBind(new VRMExpressionTextureTransformBind({
                material,
                scale,
                offset
              }));
              return;
            }
            const materialColorType = v0ExpressionMaterialColorMap[materialPropertyName];
            if (materialColorType) {
              expression.addBind(new VRMExpressionMaterialColorBind({
                material,
                type: materialColorType,
                targetValue: new THREE4.Color().fromArray(materialValue.targetValue),
                targetAlpha: materialValue.targetValue[3]
              }));
              return;
            }
            console.warn(materialPropertyName + " is not supported");
          });
        });
      }
      manager.registerExpression(expression);
    }));
    return manager;
  }
}
// packages/three-vrm-core/src/expressions/VRMExpressionOverrideType.ts
var VRMExpressionOverrideType = {
  None: "none",
  Block: "block",
  Blend: "blend"
};
// packages/three-vrm-core/src/firstPerson/VRMFirstPerson.ts
import * as THREE5 from "three";

class VRMFirstPerson {
  static DEFAULT_FIRSTPERSON_ONLY_LAYER = 9;
  static DEFAULT_THIRDPERSON_ONLY_LAYER = 10;
  humanoid;
  meshAnnotations;
  _firstPersonOnlyLayer = VRMFirstPerson.DEFAULT_FIRSTPERSON_ONLY_LAYER;
  _thirdPersonOnlyLayer = VRMFirstPerson.DEFAULT_THIRDPERSON_ONLY_LAYER;
  _initializedLayers = false;
  constructor(humanoid, meshAnnotations) {
    this.humanoid = humanoid;
    this.meshAnnotations = meshAnnotations;
  }
  copy(source) {
    if (this.humanoid !== source.humanoid) {
      throw new Error("VRMFirstPerson: humanoid must be same in order to copy");
    }
    this.meshAnnotations = source.meshAnnotations.map((annotation) => ({
      meshes: annotation.meshes.concat(),
      type: annotation.type
    }));
    return this;
  }
  clone() {
    return new VRMFirstPerson(this.humanoid, this.meshAnnotations).copy(this);
  }
  get firstPersonOnlyLayer() {
    return this._firstPersonOnlyLayer;
  }
  get thirdPersonOnlyLayer() {
    return this._thirdPersonOnlyLayer;
  }
  setup({
    firstPersonOnlyLayer = VRMFirstPerson.DEFAULT_FIRSTPERSON_ONLY_LAYER,
    thirdPersonOnlyLayer = VRMFirstPerson.DEFAULT_THIRDPERSON_ONLY_LAYER
  } = {}) {
    if (this._initializedLayers) {
      return;
    }
    this._firstPersonOnlyLayer = firstPersonOnlyLayer;
    this._thirdPersonOnlyLayer = thirdPersonOnlyLayer;
    this.meshAnnotations.forEach((item) => {
      item.meshes.forEach((mesh) => {
        if (item.type === "firstPersonOnly") {
          mesh.layers.set(this._firstPersonOnlyLayer);
          mesh.traverse((child) => child.layers.set(this._firstPersonOnlyLayer));
        } else if (item.type === "thirdPersonOnly") {
          mesh.layers.set(this._thirdPersonOnlyLayer);
          mesh.traverse((child) => child.layers.set(this._thirdPersonOnlyLayer));
        } else if (item.type === "auto") {
          this._createHeadlessModel(mesh);
        }
      });
    });
    this._initializedLayers = true;
  }
  _excludeTriangles(triangles, bws, skinIndex, exclude) {
    let count = 0;
    if (bws != null && bws.length > 0) {
      for (let i = 0;i < triangles.length; i += 3) {
        const a = triangles[i];
        const b = triangles[i + 1];
        const c = triangles[i + 2];
        const bw0 = bws[a];
        const skin0 = skinIndex[a];
        if (bw0[0] > 0 && exclude.includes(skin0[0]))
          continue;
        if (bw0[1] > 0 && exclude.includes(skin0[1]))
          continue;
        if (bw0[2] > 0 && exclude.includes(skin0[2]))
          continue;
        if (bw0[3] > 0 && exclude.includes(skin0[3]))
          continue;
        const bw1 = bws[b];
        const skin1 = skinIndex[b];
        if (bw1[0] > 0 && exclude.includes(skin1[0]))
          continue;
        if (bw1[1] > 0 && exclude.includes(skin1[1]))
          continue;
        if (bw1[2] > 0 && exclude.includes(skin1[2]))
          continue;
        if (bw1[3] > 0 && exclude.includes(skin1[3]))
          continue;
        const bw2 = bws[c];
        const skin2 = skinIndex[c];
        if (bw2[0] > 0 && exclude.includes(skin2[0]))
          continue;
        if (bw2[1] > 0 && exclude.includes(skin2[1]))
          continue;
        if (bw2[2] > 0 && exclude.includes(skin2[2]))
          continue;
        if (bw2[3] > 0 && exclude.includes(skin2[3]))
          continue;
        triangles[count++] = a;
        triangles[count++] = b;
        triangles[count++] = c;
      }
    }
    return count;
  }
  _createErasedMesh(src, erasingBonesIndex) {
    const dst = new THREE5.SkinnedMesh(src.geometry.clone(), src.material);
    dst.name = `${src.name}(erase)`;
    dst.frustumCulled = src.frustumCulled;
    dst.layers.set(this._firstPersonOnlyLayer);
    const geometry = dst.geometry;
    const skinIndexAttr = geometry.getAttribute("skinIndex");
    const skinIndexAttrArray = skinIndexAttr instanceof THREE5.GLBufferAttribute ? [] : skinIndexAttr.array;
    const skinIndex = [];
    for (let i = 0;i < skinIndexAttrArray.length; i += 4) {
      skinIndex.push([
        skinIndexAttrArray[i],
        skinIndexAttrArray[i + 1],
        skinIndexAttrArray[i + 2],
        skinIndexAttrArray[i + 3]
      ]);
    }
    const skinWeightAttr = geometry.getAttribute("skinWeight");
    const skinWeightAttrArray = skinWeightAttr instanceof THREE5.GLBufferAttribute ? [] : skinWeightAttr.array;
    const skinWeight = [];
    for (let i = 0;i < skinWeightAttrArray.length; i += 4) {
      skinWeight.push([
        skinWeightAttrArray[i],
        skinWeightAttrArray[i + 1],
        skinWeightAttrArray[i + 2],
        skinWeightAttrArray[i + 3]
      ]);
    }
    const index = geometry.getIndex();
    if (!index) {
      throw new Error("The geometry doesn't have an index buffer");
    }
    const oldTriangles = Array.from(index.array);
    const count = this._excludeTriangles(oldTriangles, skinWeight, skinIndex, erasingBonesIndex);
    const newTriangle = [];
    for (let i = 0;i < count; i++) {
      newTriangle[i] = oldTriangles[i];
    }
    geometry.setIndex(newTriangle);
    if (src.onBeforeRender) {
      dst.onBeforeRender = src.onBeforeRender;
    }
    dst.bind(new THREE5.Skeleton(src.skeleton.bones, src.skeleton.boneInverses), new THREE5.Matrix4);
    return dst;
  }
  _createHeadlessModelForSkinnedMesh(parent, mesh) {
    const eraseBoneIndexes = [];
    mesh.skeleton.bones.forEach((bone, index) => {
      if (this._isEraseTarget(bone))
        eraseBoneIndexes.push(index);
    });
    if (!eraseBoneIndexes.length) {
      mesh.layers.enable(this._thirdPersonOnlyLayer);
      mesh.layers.enable(this._firstPersonOnlyLayer);
      return;
    }
    mesh.layers.set(this._thirdPersonOnlyLayer);
    const newMesh = this._createErasedMesh(mesh, eraseBoneIndexes);
    parent.add(newMesh);
  }
  _createHeadlessModel(node) {
    if (node.type === "Group") {
      node.layers.set(this._thirdPersonOnlyLayer);
      if (this._isEraseTarget(node)) {
        node.traverse((child) => child.layers.set(this._thirdPersonOnlyLayer));
      } else {
        const parent = new THREE5.Group;
        parent.name = `_headless_${node.name}`;
        parent.layers.set(this._firstPersonOnlyLayer);
        node.parent.add(parent);
        node.children.filter((child) => child.type === "SkinnedMesh").forEach((child) => {
          const skinnedMesh = child;
          this._createHeadlessModelForSkinnedMesh(parent, skinnedMesh);
        });
      }
    } else if (node.type === "SkinnedMesh") {
      const skinnedMesh = node;
      this._createHeadlessModelForSkinnedMesh(node.parent, skinnedMesh);
    } else {
      if (this._isEraseTarget(node)) {
        node.layers.set(this._thirdPersonOnlyLayer);
        node.traverse((child) => child.layers.set(this._thirdPersonOnlyLayer));
      }
    }
  }
  _isEraseTarget(bone) {
    if (bone === this.humanoid.getRawBoneNode("head")) {
      return true;
    } else if (!bone.parent) {
      return false;
    } else {
      return this._isEraseTarget(bone.parent);
    }
  }
}
// packages/three-vrm-core/src/firstPerson/VRMFirstPersonLoaderPlugin.ts
var POSSIBLE_SPEC_VERSIONS2 = new Set(["1.0", "1.0-beta"]);

class VRMFirstPersonLoaderPlugin {
  parser;
  get name() {
    return "VRMFirstPersonLoaderPlugin";
  }
  constructor(parser) {
    this.parser = parser;
  }
  async afterRoot(gltf) {
    const vrmHumanoid = gltf.userData.vrmHumanoid;
    if (vrmHumanoid === null) {
      return;
    } else if (vrmHumanoid === undefined) {
      throw new Error("VRMFirstPersonLoaderPlugin: vrmHumanoid is undefined. VRMHumanoidLoaderPlugin have to be used first");
    }
    gltf.userData.vrmFirstPerson = await this._import(gltf, vrmHumanoid);
  }
  async _import(gltf, humanoid) {
    if (humanoid == null) {
      return null;
    }
    const v1Result = await this._v1Import(gltf, humanoid);
    if (v1Result) {
      return v1Result;
    }
    const v0Result = await this._v0Import(gltf, humanoid);
    if (v0Result) {
      return v0Result;
    }
    return null;
  }
  async _v1Import(gltf, humanoid) {
    const json = this.parser.json;
    const isVRMUsed = json.extensionsUsed?.indexOf("VRMC_vrm") !== -1;
    if (!isVRMUsed) {
      return null;
    }
    const extension = json.extensions?.["VRMC_vrm"];
    if (!extension) {
      return null;
    }
    const specVersion = extension.specVersion;
    if (!POSSIBLE_SPEC_VERSIONS2.has(specVersion)) {
      console.warn(`VRMFirstPersonLoaderPlugin: Unknown VRMC_vrm specVersion "${specVersion}"`);
      return null;
    }
    const schemaFirstPerson = extension.firstPerson;
    if (!schemaFirstPerson) {
      return null;
    }
    const meshAnnotations = [];
    const nodePrimitivesMap = await gltfExtractPrimitivesFromNodes(gltf);
    Array.from(nodePrimitivesMap.entries()).forEach(([nodeIndex, primitives]) => {
      const annotation = schemaFirstPerson.meshAnnotations ? schemaFirstPerson.meshAnnotations.find((a) => a.node === nodeIndex) : undefined;
      meshAnnotations.push({
        meshes: primitives,
        type: annotation?.type ?? "both"
      });
    });
    return new VRMFirstPerson(humanoid, meshAnnotations);
  }
  async _v0Import(gltf, humanoid) {
    const json = this.parser.json;
    const vrmExt = json.extensions?.VRM;
    if (!vrmExt) {
      return null;
    }
    const schemaFirstPerson = vrmExt.firstPerson;
    if (!schemaFirstPerson) {
      return null;
    }
    const meshAnnotations = [];
    const nodePrimitivesMap = await gltfExtractPrimitivesFromNodes(gltf);
    Array.from(nodePrimitivesMap.entries()).forEach(([nodeIndex, primitives]) => {
      const schemaNode = json.nodes[nodeIndex];
      const flag = schemaFirstPerson.meshAnnotations ? schemaFirstPerson.meshAnnotations.find((a) => a.mesh === schemaNode.mesh) : undefined;
      meshAnnotations.push({
        meshes: primitives,
        type: this._convertV0FlagToV1Type(flag?.firstPersonFlag)
      });
    });
    return new VRMFirstPerson(humanoid, meshAnnotations);
  }
  _convertV0FlagToV1Type(flag) {
    if (flag === "FirstPersonOnly") {
      return "firstPersonOnly";
    } else if (flag === "ThirdPersonOnly") {
      return "thirdPersonOnly";
    } else if (flag === "Auto") {
      return "auto";
    } else {
      return "both";
    }
  }
}
// packages/three-vrm-core/src/firstPerson/VRMFirstPersonMeshAnnotationType.ts
var VRMFirstPersonMeshAnnotationType = {
  Auto: "auto",
  Both: "both",
  ThirdPersonOnly: "thirdPersonOnly",
  FirstPersonOnly: "firstPersonOnly"
};
// packages/three-vrm-core/src/humanoid/helpers/VRMHumanoidHelper.ts
import * as THREE6 from "three";
var _v3A = new THREE6.Vector3;
var _v3B = new THREE6.Vector3;
var _quatA = new THREE6.Quaternion;

class VRMHumanoidHelper extends THREE6.Group {
  vrmHumanoid;
  _boneAxesMap;
  constructor(humanoid) {
    super();
    this.vrmHumanoid = humanoid;
    this._boneAxesMap = new Map;
    Object.values(humanoid.humanBones).forEach((bone) => {
      const helper = new THREE6.AxesHelper(1);
      helper.matrixAutoUpdate = false;
      helper.material.depthTest = false;
      helper.material.depthWrite = false;
      this.add(helper);
      this._boneAxesMap.set(bone, helper);
    });
  }
  dispose() {
    Array.from(this._boneAxesMap.values()).forEach((axes) => {
      axes.geometry.dispose();
      axes.material.dispose();
    });
  }
  updateMatrixWorld(force) {
    Array.from(this._boneAxesMap.entries()).forEach(([bone, axes]) => {
      bone.node.updateWorldMatrix(true, false);
      bone.node.matrixWorld.decompose(_v3A, _quatA, _v3B);
      const scale = _v3A.set(0.1, 0.1, 0.1).divide(_v3B);
      axes.matrix.copy(bone.node.matrixWorld).scale(scale);
    });
    super.updateMatrixWorld(force);
  }
}
// packages/three-vrm-core/src/humanoid/VRMHumanBoneList.ts
var VRMHumanBoneList = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftEye",
  "rightEye",
  "jaw",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftThumbMetacarpal",
  "leftThumbProximal",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightThumbMetacarpal",
  "rightThumbProximal",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal"
];
// packages/three-vrm-core/src/humanoid/VRMHumanBoneName.ts
var VRMHumanBoneName = {
  Hips: "hips",
  Spine: "spine",
  Chest: "chest",
  UpperChest: "upperChest",
  Neck: "neck",
  Head: "head",
  LeftEye: "leftEye",
  RightEye: "rightEye",
  Jaw: "jaw",
  LeftUpperLeg: "leftUpperLeg",
  LeftLowerLeg: "leftLowerLeg",
  LeftFoot: "leftFoot",
  LeftToes: "leftToes",
  RightUpperLeg: "rightUpperLeg",
  RightLowerLeg: "rightLowerLeg",
  RightFoot: "rightFoot",
  RightToes: "rightToes",
  LeftShoulder: "leftShoulder",
  LeftUpperArm: "leftUpperArm",
  LeftLowerArm: "leftLowerArm",
  LeftHand: "leftHand",
  RightShoulder: "rightShoulder",
  RightUpperArm: "rightUpperArm",
  RightLowerArm: "rightLowerArm",
  RightHand: "rightHand",
  LeftThumbMetacarpal: "leftThumbMetacarpal",
  LeftThumbProximal: "leftThumbProximal",
  LeftThumbDistal: "leftThumbDistal",
  LeftIndexProximal: "leftIndexProximal",
  LeftIndexIntermediate: "leftIndexIntermediate",
  LeftIndexDistal: "leftIndexDistal",
  LeftMiddleProximal: "leftMiddleProximal",
  LeftMiddleIntermediate: "leftMiddleIntermediate",
  LeftMiddleDistal: "leftMiddleDistal",
  LeftRingProximal: "leftRingProximal",
  LeftRingIntermediate: "leftRingIntermediate",
  LeftRingDistal: "leftRingDistal",
  LeftLittleProximal: "leftLittleProximal",
  LeftLittleIntermediate: "leftLittleIntermediate",
  LeftLittleDistal: "leftLittleDistal",
  RightThumbMetacarpal: "rightThumbMetacarpal",
  RightThumbProximal: "rightThumbProximal",
  RightThumbDistal: "rightThumbDistal",
  RightIndexProximal: "rightIndexProximal",
  RightIndexIntermediate: "rightIndexIntermediate",
  RightIndexDistal: "rightIndexDistal",
  RightMiddleProximal: "rightMiddleProximal",
  RightMiddleIntermediate: "rightMiddleIntermediate",
  RightMiddleDistal: "rightMiddleDistal",
  RightRingProximal: "rightRingProximal",
  RightRingIntermediate: "rightRingIntermediate",
  RightRingDistal: "rightRingDistal",
  RightLittleProximal: "rightLittleProximal",
  RightLittleIntermediate: "rightLittleIntermediate",
  RightLittleDistal: "rightLittleDistal"
};
// packages/three-vrm-core/src/humanoid/VRMHumanBoneParentMap.ts
var VRMHumanBoneParentMap = {
  hips: null,
  spine: "hips",
  chest: "spine",
  upperChest: "chest",
  neck: "upperChest",
  head: "neck",
  leftEye: "head",
  rightEye: "head",
  jaw: "head",
  leftUpperLeg: "hips",
  leftLowerLeg: "leftUpperLeg",
  leftFoot: "leftLowerLeg",
  leftToes: "leftFoot",
  rightUpperLeg: "hips",
  rightLowerLeg: "rightUpperLeg",
  rightFoot: "rightLowerLeg",
  rightToes: "rightFoot",
  leftShoulder: "upperChest",
  leftUpperArm: "leftShoulder",
  leftLowerArm: "leftUpperArm",
  leftHand: "leftLowerArm",
  rightShoulder: "upperChest",
  rightUpperArm: "rightShoulder",
  rightLowerArm: "rightUpperArm",
  rightHand: "rightLowerArm",
  leftThumbMetacarpal: "leftHand",
  leftThumbProximal: "leftThumbMetacarpal",
  leftThumbDistal: "leftThumbProximal",
  leftIndexProximal: "leftHand",
  leftIndexIntermediate: "leftIndexProximal",
  leftIndexDistal: "leftIndexIntermediate",
  leftMiddleProximal: "leftHand",
  leftMiddleIntermediate: "leftMiddleProximal",
  leftMiddleDistal: "leftMiddleIntermediate",
  leftRingProximal: "leftHand",
  leftRingIntermediate: "leftRingProximal",
  leftRingDistal: "leftRingIntermediate",
  leftLittleProximal: "leftHand",
  leftLittleIntermediate: "leftLittleProximal",
  leftLittleDistal: "leftLittleIntermediate",
  rightThumbMetacarpal: "rightHand",
  rightThumbProximal: "rightThumbMetacarpal",
  rightThumbDistal: "rightThumbProximal",
  rightIndexProximal: "rightHand",
  rightIndexIntermediate: "rightIndexProximal",
  rightIndexDistal: "rightIndexIntermediate",
  rightMiddleProximal: "rightHand",
  rightMiddleIntermediate: "rightMiddleProximal",
  rightMiddleDistal: "rightMiddleIntermediate",
  rightRingProximal: "rightHand",
  rightRingIntermediate: "rightRingProximal",
  rightRingDistal: "rightRingIntermediate",
  rightLittleProximal: "rightHand",
  rightLittleIntermediate: "rightLittleProximal",
  rightLittleDistal: "rightLittleIntermediate"
};
// packages/three-vrm-core/src/humanoid/VRMRig.ts
import * as THREE7 from "three";

// packages/three-vrm-core/src/utils/quatInvertCompat.ts
function quatInvertCompat(target) {
  if (target.invert) {
    target.invert();
  } else {
    target.inverse();
  }
  return target;
}

// packages/three-vrm-core/src/humanoid/VRMRig.ts
var _v3A2 = new THREE7.Vector3;
var _quatA2 = new THREE7.Quaternion;

class VRMRig {
  humanBones;
  restPose;
  constructor(humanBones) {
    this.humanBones = humanBones;
    this.restPose = this.getAbsolutePose();
  }
  getAbsolutePose() {
    const pose = {};
    Object.keys(this.humanBones).forEach((vrmBoneNameString) => {
      const vrmBoneName = vrmBoneNameString;
      const node = this.getBoneNode(vrmBoneName);
      if (!node) {
        return;
      }
      _v3A2.copy(node.position);
      _quatA2.copy(node.quaternion);
      pose[vrmBoneName] = {
        position: _v3A2.toArray(),
        rotation: _quatA2.toArray()
      };
    });
    return pose;
  }
  getPose() {
    const pose = {};
    Object.keys(this.humanBones).forEach((boneNameString) => {
      const boneName = boneNameString;
      const node = this.getBoneNode(boneName);
      if (!node) {
        return;
      }
      _v3A2.set(0, 0, 0);
      _quatA2.identity();
      const restState = this.restPose[boneName];
      if (restState?.position) {
        _v3A2.fromArray(restState.position).negate();
      }
      if (restState?.rotation) {
        quatInvertCompat(_quatA2.fromArray(restState.rotation));
      }
      _v3A2.add(node.position);
      _quatA2.premultiply(node.quaternion);
      pose[boneName] = {
        position: _v3A2.toArray(),
        rotation: _quatA2.toArray()
      };
    });
    return pose;
  }
  setPose(poseObject) {
    Object.entries(poseObject).forEach(([boneNameString, state]) => {
      const boneName = boneNameString;
      const node = this.getBoneNode(boneName);
      if (!node) {
        return;
      }
      const restState = this.restPose[boneName];
      if (!restState) {
        return;
      }
      if (state?.position) {
        node.position.fromArray(state.position);
        if (restState.position) {
          node.position.add(_v3A2.fromArray(restState.position));
        }
      }
      if (state?.rotation) {
        node.quaternion.fromArray(state.rotation);
        if (restState.rotation) {
          node.quaternion.multiply(_quatA2.fromArray(restState.rotation));
        }
      }
    });
  }
  resetPose() {
    Object.entries(this.restPose).forEach(([boneName, rest]) => {
      const node = this.getBoneNode(boneName);
      if (!node) {
        return;
      }
      if (rest?.position) {
        node.position.fromArray(rest.position);
      }
      if (rest?.rotation) {
        node.quaternion.fromArray(rest.rotation);
      }
    });
  }
  getBone(name) {
    return this.humanBones[name] ?? undefined;
  }
  getBoneNode(name) {
    return this.humanBones[name]?.node ?? null;
  }
}

// packages/three-vrm-core/src/humanoid/VRMHumanoidRig.ts
import * as THREE8 from "three";
var _v3A3 = new THREE8.Vector3;
var _quatA3 = new THREE8.Quaternion;
var _boneWorldPos = new THREE8.Vector3;

class VRMHumanoidRig extends VRMRig {
  static _setupTransforms(modelRig) {
    const root = new THREE8.Object3D;
    root.name = "VRMHumanoidRig";
    const boneWorldPositions = {};
    const boneWorldRotations = {};
    const boneRotations = {};
    const parentWorldRotations = {};
    VRMHumanBoneList.forEach((boneName) => {
      const boneNode = modelRig.getBoneNode(boneName);
      if (boneNode) {
        const boneWorldPosition = new THREE8.Vector3;
        const boneWorldRotation = new THREE8.Quaternion;
        boneNode.updateWorldMatrix(true, false);
        boneNode.matrixWorld.decompose(boneWorldPosition, boneWorldRotation, _v3A3);
        boneWorldPositions[boneName] = boneWorldPosition;
        boneWorldRotations[boneName] = boneWorldRotation;
        boneRotations[boneName] = boneNode.quaternion.clone();
        const parentWorldRotation = new THREE8.Quaternion;
        boneNode.parent?.matrixWorld.decompose(_v3A3, parentWorldRotation, _v3A3);
        parentWorldRotations[boneName] = parentWorldRotation;
      }
    });
    const rigBones = {};
    VRMHumanBoneList.forEach((boneName) => {
      const boneNode = modelRig.getBoneNode(boneName);
      if (boneNode) {
        const boneWorldPosition = boneWorldPositions[boneName];
        let currentBoneName = boneName;
        let parentBoneWorldPosition;
        while (parentBoneWorldPosition == null) {
          currentBoneName = VRMHumanBoneParentMap[currentBoneName];
          if (currentBoneName == null) {
            break;
          }
          parentBoneWorldPosition = boneWorldPositions[currentBoneName];
        }
        const rigBoneNode = new THREE8.Object3D;
        rigBoneNode.name = "Normalized_" + boneNode.name;
        const parentRigBoneNode = currentBoneName ? rigBones[currentBoneName]?.node : root;
        parentRigBoneNode.add(rigBoneNode);
        rigBoneNode.position.copy(boneWorldPosition);
        if (parentBoneWorldPosition) {
          rigBoneNode.position.sub(parentBoneWorldPosition);
        }
        rigBones[boneName] = { node: rigBoneNode };
      }
    });
    return {
      rigBones,
      root,
      parentWorldRotations,
      boneRotations
    };
  }
  original;
  root;
  _parentWorldRotations;
  _boneRotations;
  constructor(humanoid) {
    const { rigBones, root, parentWorldRotations, boneRotations } = VRMHumanoidRig._setupTransforms(humanoid);
    super(rigBones);
    this.original = humanoid;
    this.root = root;
    this._parentWorldRotations = parentWorldRotations;
    this._boneRotations = boneRotations;
  }
  update() {
    VRMHumanBoneList.forEach((boneName) => {
      const boneNode = this.original.getBoneNode(boneName);
      if (boneNode != null) {
        const rigBoneNode = this.getBoneNode(boneName);
        const parentWorldRotation = this._parentWorldRotations[boneName];
        const invParentWorldRotation = _quatA3.copy(parentWorldRotation).invert();
        const boneRotation = this._boneRotations[boneName];
        boneNode.quaternion.copy(rigBoneNode.quaternion).multiply(parentWorldRotation).premultiply(invParentWorldRotation).multiply(boneRotation);
        if (boneName === "hips") {
          const boneWorldPosition = rigBoneNode.getWorldPosition(_boneWorldPos);
          boneNode.parent.updateWorldMatrix(true, false);
          const parentWorldMatrix = boneNode.parent.matrixWorld;
          const localPosition = boneWorldPosition.applyMatrix4(parentWorldMatrix.invert());
          boneNode.position.copy(localPosition);
        }
      }
    });
  }
}

// packages/three-vrm-core/src/humanoid/VRMHumanoid.ts
class VRMHumanoid {
  autoUpdateHumanBones;
  _rawHumanBones;
  _normalizedHumanBones;
  get restPose() {
    console.warn("VRMHumanoid: restPose is deprecated. Use either rawRestPose or normalizedRestPose instead.");
    return this.rawRestPose;
  }
  get rawRestPose() {
    return this._rawHumanBones.restPose;
  }
  get normalizedRestPose() {
    return this._normalizedHumanBones.restPose;
  }
  get humanBones() {
    return this._rawHumanBones.humanBones;
  }
  get rawHumanBones() {
    return this._rawHumanBones.humanBones;
  }
  get normalizedHumanBones() {
    return this._normalizedHumanBones.humanBones;
  }
  get normalizedHumanBonesRoot() {
    return this._normalizedHumanBones.root;
  }
  constructor(humanBones, options) {
    this.autoUpdateHumanBones = options?.autoUpdateHumanBones ?? true;
    this._rawHumanBones = new VRMRig(humanBones);
    this._normalizedHumanBones = new VRMHumanoidRig(this._rawHumanBones);
  }
  copy(source) {
    this.autoUpdateHumanBones = source.autoUpdateHumanBones;
    this._rawHumanBones = new VRMRig(source.humanBones);
    this._normalizedHumanBones = new VRMHumanoidRig(this._rawHumanBones);
    return this;
  }
  clone() {
    return new VRMHumanoid(this.humanBones, { autoUpdateHumanBones: this.autoUpdateHumanBones }).copy(this);
  }
  getAbsolutePose() {
    console.warn("VRMHumanoid: getAbsolutePose() is deprecated. Use either getRawAbsolutePose() or getNormalizedAbsolutePose() instead.");
    return this.getRawAbsolutePose();
  }
  getRawAbsolutePose() {
    return this._rawHumanBones.getAbsolutePose();
  }
  getNormalizedAbsolutePose() {
    return this._normalizedHumanBones.getAbsolutePose();
  }
  getPose() {
    console.warn("VRMHumanoid: getPose() is deprecated. Use either getRawPose() or getNormalizedPose() instead.");
    return this.getRawPose();
  }
  getRawPose() {
    return this._rawHumanBones.getPose();
  }
  getNormalizedPose() {
    return this._normalizedHumanBones.getPose();
  }
  setPose(poseObject) {
    console.warn("VRMHumanoid: setPose() is deprecated. Use either setRawPose() or setNormalizedPose() instead.");
    return this.setRawPose(poseObject);
  }
  setRawPose(poseObject) {
    return this._rawHumanBones.setPose(poseObject);
  }
  setNormalizedPose(poseObject) {
    return this._normalizedHumanBones.setPose(poseObject);
  }
  resetPose() {
    console.warn("VRMHumanoid: resetPose() is deprecated. Use either resetRawPose() or resetNormalizedPose() instead.");
    return this.resetRawPose();
  }
  resetRawPose() {
    return this._rawHumanBones.resetPose();
  }
  resetNormalizedPose() {
    return this._normalizedHumanBones.resetPose();
  }
  getBone(name) {
    console.warn("VRMHumanoid: getBone() is deprecated. Use either getRawBone() or getNormalizedBone() instead.");
    return this.getRawBone(name);
  }
  getRawBone(name) {
    return this._rawHumanBones.getBone(name);
  }
  getNormalizedBone(name) {
    return this._normalizedHumanBones.getBone(name);
  }
  getBoneNode(name) {
    console.warn("VRMHumanoid: getBoneNode() is deprecated. Use either getRawBoneNode() or getNormalizedBoneNode() instead.");
    return this.getRawBoneNode(name);
  }
  getRawBoneNode(name) {
    return this._rawHumanBones.getBoneNode(name);
  }
  getNormalizedBoneNode(name) {
    return this._normalizedHumanBones.getBoneNode(name);
  }
  update() {
    if (this.autoUpdateHumanBones) {
      this._normalizedHumanBones.update();
    }
  }
}
// packages/three-vrm-core/src/humanoid/VRMRequiredHumanBoneName.ts
var VRMRequiredHumanBoneName = {
  Hips: "hips",
  Spine: "spine",
  Head: "head",
  LeftUpperLeg: "leftUpperLeg",
  LeftLowerLeg: "leftLowerLeg",
  LeftFoot: "leftFoot",
  RightUpperLeg: "rightUpperLeg",
  RightLowerLeg: "rightLowerLeg",
  RightFoot: "rightFoot",
  LeftUpperArm: "leftUpperArm",
  LeftLowerArm: "leftLowerArm",
  LeftHand: "leftHand",
  RightUpperArm: "rightUpperArm",
  RightLowerArm: "rightLowerArm",
  RightHand: "rightHand"
};

// packages/three-vrm-core/src/humanoid/VRMHumanoidLoaderPlugin.ts
var POSSIBLE_SPEC_VERSIONS3 = new Set(["1.0", "1.0-beta"]);
var thumbBoneNameMap = {
  leftThumbProximal: "leftThumbMetacarpal",
  leftThumbIntermediate: "leftThumbProximal",
  rightThumbProximal: "rightThumbMetacarpal",
  rightThumbIntermediate: "rightThumbProximal"
};

class VRMHumanoidLoaderPlugin {
  helperRoot;
  autoUpdateHumanBones;
  parser;
  get name() {
    return "VRMHumanoidLoaderPlugin";
  }
  constructor(parser, options) {
    this.parser = parser;
    this.helperRoot = options?.helperRoot;
    this.autoUpdateHumanBones = options?.autoUpdateHumanBones;
  }
  async afterRoot(gltf) {
    gltf.userData.vrmHumanoid = await this._import(gltf);
  }
  async _import(gltf) {
    const v1Result = await this._v1Import(gltf);
    if (v1Result) {
      return v1Result;
    }
    const v0Result = await this._v0Import(gltf);
    if (v0Result) {
      return v0Result;
    }
    return null;
  }
  async _v1Import(gltf) {
    const json = this.parser.json;
    const isVRMUsed = json.extensionsUsed?.indexOf("VRMC_vrm") !== -1;
    if (!isVRMUsed) {
      return null;
    }
    const extension = json.extensions?.["VRMC_vrm"];
    if (!extension) {
      return null;
    }
    const specVersion = extension.specVersion;
    if (!POSSIBLE_SPEC_VERSIONS3.has(specVersion)) {
      console.warn(`VRMHumanoidLoaderPlugin: Unknown VRMC_vrm specVersion "${specVersion}"`);
      return null;
    }
    const schemaHumanoid = extension.humanoid;
    if (!schemaHumanoid) {
      return null;
    }
    const existsPreviousThumbName = schemaHumanoid.humanBones.leftThumbIntermediate != null || schemaHumanoid.humanBones.rightThumbIntermediate != null;
    const humanBones = {};
    if (schemaHumanoid.humanBones != null) {
      await Promise.all(Object.entries(schemaHumanoid.humanBones).map(async ([boneNameString, schemaHumanBone]) => {
        let boneName = boneNameString;
        const index = schemaHumanBone.node;
        if (existsPreviousThumbName) {
          const thumbBoneName = thumbBoneNameMap[boneName];
          if (thumbBoneName != null) {
            boneName = thumbBoneName;
          }
        }
        const node = await this.parser.getDependency("node", index);
        if (node == null) {
          console.warn(`A glTF node bound to the humanoid bone ${boneName} (index = ${index}) does not exist`);
          return;
        }
        humanBones[boneName] = { node };
      }));
    }
    const humanoid = new VRMHumanoid(this._ensureRequiredBonesExist(humanBones), {
      autoUpdateHumanBones: this.autoUpdateHumanBones
    });
    gltf.scene.add(humanoid.normalizedHumanBonesRoot);
    if (this.helperRoot) {
      const helper = new VRMHumanoidHelper(humanoid);
      this.helperRoot.add(helper);
      helper.renderOrder = this.helperRoot.renderOrder;
    }
    return humanoid;
  }
  async _v0Import(gltf) {
    const json = this.parser.json;
    const vrmExt = json.extensions?.VRM;
    if (!vrmExt) {
      return null;
    }
    const schemaHumanoid = vrmExt.humanoid;
    if (!schemaHumanoid) {
      return null;
    }
    const humanBones = {};
    if (schemaHumanoid.humanBones != null) {
      await Promise.all(schemaHumanoid.humanBones.map(async (bone) => {
        const boneName = bone.bone;
        const index = bone.node;
        if (boneName == null || index == null) {
          return;
        }
        const node = await this.parser.getDependency("node", index);
        if (node == null) {
          console.warn(`A glTF node bound to the humanoid bone ${boneName} (index = ${index}) does not exist`);
          return;
        }
        const thumbBoneName = thumbBoneNameMap[boneName];
        const newBoneName = thumbBoneName ?? boneName;
        if (humanBones[newBoneName] != null) {
          console.warn(`Multiple bone entries for ${newBoneName} detected (index = ${index}), ignoring duplicated entries.`);
          return;
        }
        humanBones[newBoneName] = { node };
      }));
    }
    const humanoid = new VRMHumanoid(this._ensureRequiredBonesExist(humanBones), {
      autoUpdateHumanBones: this.autoUpdateHumanBones
    });
    gltf.scene.add(humanoid.normalizedHumanBonesRoot);
    if (this.helperRoot) {
      const helper = new VRMHumanoidHelper(humanoid);
      this.helperRoot.add(helper);
      helper.renderOrder = this.helperRoot.renderOrder;
    }
    return humanoid;
  }
  _ensureRequiredBonesExist(humanBones) {
    const missingRequiredBones = Object.values(VRMRequiredHumanBoneName).filter((requiredBoneName) => humanBones[requiredBoneName] == null);
    if (missingRequiredBones.length > 0) {
      throw new Error(`VRMHumanoidLoaderPlugin: These humanoid bones are required but not exist: ${missingRequiredBones.join(", ")}`);
    }
    return humanBones;
  }
}
// packages/three-vrm-core/src/lookAt/helpers/VRMLookAtHelper.ts
import * as THREE11 from "three";

// packages/three-vrm-core/src/lookAt/helpers/utils/FanBufferGeometry.ts
import * as THREE9 from "three";

class FanBufferGeometry extends THREE9.BufferGeometry {
  theta;
  radius;
  _currentTheta = 0;
  _currentRadius = 0;
  _attrPos;
  _attrIndex;
  constructor() {
    super();
    this.theta = 0;
    this.radius = 0;
    this._currentTheta = 0;
    this._currentRadius = 0;
    this._attrPos = new THREE9.BufferAttribute(new Float32Array(65 * 3), 3);
    this.setAttribute("position", this._attrPos);
    this._attrIndex = new THREE9.BufferAttribute(new Uint16Array(3 * 63), 1);
    this.setIndex(this._attrIndex);
    this._buildIndex();
    this.update();
  }
  update() {
    let shouldUpdateGeometry = false;
    if (this._currentTheta !== this.theta) {
      this._currentTheta = this.theta;
      shouldUpdateGeometry = true;
    }
    if (this._currentRadius !== this.radius) {
      this._currentRadius = this.radius;
      shouldUpdateGeometry = true;
    }
    if (shouldUpdateGeometry) {
      this._buildPosition();
    }
  }
  _buildPosition() {
    this._attrPos.setXYZ(0, 0, 0, 0);
    for (let i = 0;i < 64; i++) {
      const t = i / 63 * this._currentTheta;
      this._attrPos.setXYZ(i + 1, this._currentRadius * Math.sin(t), 0, this._currentRadius * Math.cos(t));
    }
    this._attrPos.needsUpdate = true;
  }
  _buildIndex() {
    for (let i = 0;i < 63; i++) {
      this._attrIndex.setXYZ(i * 3, 0, i + 1, i + 2);
    }
    this._attrIndex.needsUpdate = true;
  }
}

// packages/three-vrm-core/src/lookAt/helpers/utils/LineAndSphereBufferGeometry.ts
import * as THREE10 from "three";

class LineAndSphereBufferGeometry extends THREE10.BufferGeometry {
  radius;
  tail;
  _currentRadius;
  _currentTail;
  _attrPos;
  _attrIndex;
  constructor() {
    super();
    this.radius = 0;
    this._currentRadius = 0;
    this.tail = new THREE10.Vector3;
    this._currentTail = new THREE10.Vector3;
    this._attrPos = new THREE10.BufferAttribute(new Float32Array(294), 3);
    this.setAttribute("position", this._attrPos);
    this._attrIndex = new THREE10.BufferAttribute(new Uint16Array(194), 1);
    this.setIndex(this._attrIndex);
    this._buildIndex();
    this.update();
  }
  update() {
    let shouldUpdateGeometry = false;
    if (this._currentRadius !== this.radius) {
      this._currentRadius = this.radius;
      shouldUpdateGeometry = true;
    }
    if (!this._currentTail.equals(this.tail)) {
      this._currentTail.copy(this.tail);
      shouldUpdateGeometry = true;
    }
    if (shouldUpdateGeometry) {
      this._buildPosition();
    }
  }
  _buildPosition() {
    for (let i = 0;i < 32; i++) {
      const t = i / 16 * Math.PI;
      this._attrPos.setXYZ(i, Math.cos(t), Math.sin(t), 0);
      this._attrPos.setXYZ(32 + i, 0, Math.cos(t), Math.sin(t));
      this._attrPos.setXYZ(64 + i, Math.sin(t), 0, Math.cos(t));
    }
    this.scale(this._currentRadius, this._currentRadius, this._currentRadius);
    this.translate(this._currentTail.x, this._currentTail.y, this._currentTail.z);
    this._attrPos.setXYZ(96, 0, 0, 0);
    this._attrPos.setXYZ(97, this._currentTail.x, this._currentTail.y, this._currentTail.z);
    this._attrPos.needsUpdate = true;
  }
  _buildIndex() {
    for (let i = 0;i < 32; i++) {
      const i1 = (i + 1) % 32;
      this._attrIndex.setXY(i * 2, i, i1);
      this._attrIndex.setXY(64 + i * 2, 32 + i, 32 + i1);
      this._attrIndex.setXY(128 + i * 2, 64 + i, 64 + i1);
    }
    this._attrIndex.setXY(192, 96, 97);
    this._attrIndex.needsUpdate = true;
  }
}

// packages/three-vrm-core/src/lookAt/helpers/VRMLookAtHelper.ts
var _quatA4 = new THREE11.Quaternion;
var _quatB = new THREE11.Quaternion;
var _v3A4 = new THREE11.Vector3;
var _v3B2 = new THREE11.Vector3;
var SQRT_2_OVER_2 = Math.sqrt(2) / 2;
var QUAT_XY_CW90 = new THREE11.Quaternion(0, 0, -SQRT_2_OVER_2, SQRT_2_OVER_2);
var VEC3_POSITIVE_Y = new THREE11.Vector3(0, 1, 0);

class VRMLookAtHelper extends THREE11.Group {
  vrmLookAt;
  _meshYaw;
  _meshPitch;
  _lineTarget;
  constructor(lookAt) {
    super();
    this.matrixAutoUpdate = false;
    this.vrmLookAt = lookAt;
    {
      const geometry = new FanBufferGeometry;
      geometry.radius = 0.5;
      const material = new THREE11.MeshBasicMaterial({
        color: 65280,
        transparent: true,
        opacity: 0.5,
        side: THREE11.DoubleSide,
        depthTest: false,
        depthWrite: false
      });
      this._meshPitch = new THREE11.Mesh(geometry, material);
      this.add(this._meshPitch);
    }
    {
      const geometry = new FanBufferGeometry;
      geometry.radius = 0.5;
      const material = new THREE11.MeshBasicMaterial({
        color: 16711680,
        transparent: true,
        opacity: 0.5,
        side: THREE11.DoubleSide,
        depthTest: false,
        depthWrite: false
      });
      this._meshYaw = new THREE11.Mesh(geometry, material);
      this.add(this._meshYaw);
    }
    {
      const geometry = new LineAndSphereBufferGeometry;
      geometry.radius = 0.1;
      const material = new THREE11.LineBasicMaterial({
        color: 16777215,
        depthTest: false,
        depthWrite: false
      });
      this._lineTarget = new THREE11.LineSegments(geometry, material);
      this._lineTarget.frustumCulled = false;
      this.add(this._lineTarget);
    }
  }
  dispose() {
    this._meshYaw.geometry.dispose();
    this._meshYaw.material.dispose();
    this._meshPitch.geometry.dispose();
    this._meshPitch.material.dispose();
    this._lineTarget.geometry.dispose();
    this._lineTarget.material.dispose();
  }
  updateMatrixWorld(force) {
    const yaw = THREE11.MathUtils.DEG2RAD * this.vrmLookAt.yaw;
    this._meshYaw.geometry.theta = yaw;
    this._meshYaw.geometry.update();
    const pitch = THREE11.MathUtils.DEG2RAD * this.vrmLookAt.pitch;
    this._meshPitch.geometry.theta = pitch;
    this._meshPitch.geometry.update();
    this.vrmLookAt.getLookAtWorldPosition(_v3A4);
    this.vrmLookAt.getLookAtWorldQuaternion(_quatA4);
    _quatA4.multiply(this.vrmLookAt.getFaceFrontQuaternion(_quatB));
    this._meshYaw.position.copy(_v3A4);
    this._meshYaw.quaternion.copy(_quatA4);
    this._meshPitch.position.copy(_v3A4);
    this._meshPitch.quaternion.copy(_quatA4);
    this._meshPitch.quaternion.multiply(_quatB.setFromAxisAngle(VEC3_POSITIVE_Y, yaw));
    this._meshPitch.quaternion.multiply(QUAT_XY_CW90);
    const { target, autoUpdate } = this.vrmLookAt;
    if (target != null && autoUpdate) {
      target.getWorldPosition(_v3B2).sub(_v3A4);
      this._lineTarget.geometry.tail.copy(_v3B2);
      this._lineTarget.geometry.update();
      this._lineTarget.position.copy(_v3A4);
    }
    super.updateMatrixWorld(force);
  }
}
// packages/three-vrm-core/src/lookAt/VRMLookAt.ts
import * as THREE13 from "three";

// packages/three-vrm-core/src/utils/getWorldQuaternionLite.ts
import * as THREE12 from "three";
var _position = new THREE12.Vector3;
var _scale = new THREE12.Vector3;
function getWorldQuaternionLite(object, out) {
  object.matrixWorld.decompose(_position, out, _scale);
  return out;
}

// packages/three-vrm-core/src/lookAt/utils/calcAzimuthAltitude.ts
function calcAzimuthAltitude(vector) {
  return [Math.atan2(-vector.z, vector.x), Math.atan2(vector.y, Math.sqrt(vector.x * vector.x + vector.z * vector.z))];
}

// packages/three-vrm-core/src/lookAt/utils/sanitizeAngle.ts
function sanitizeAngle(angle) {
  const roundTurn = Math.round(angle / 2 / Math.PI);
  return angle - 2 * Math.PI * roundTurn;
}

// packages/three-vrm-core/src/lookAt/VRMLookAt.ts
var VEC3_POSITIVE_Z = new THREE13.Vector3(0, 0, 1);
var _v3A5 = new THREE13.Vector3;
var _v3B3 = new THREE13.Vector3;
var _v3C = new THREE13.Vector3;
var _quatA5 = new THREE13.Quaternion;
var _quatB2 = new THREE13.Quaternion;
var _quatC = new THREE13.Quaternion;
var _quatD = new THREE13.Quaternion;
var _eulerA = new THREE13.Euler;

class VRMLookAt {
  static EULER_ORDER = "YXZ";
  offsetFromHeadBone = new THREE13.Vector3;
  humanoid;
  applier;
  autoUpdate = true;
  target;
  faceFront = new THREE13.Vector3(0, 0, 1);
  _yaw;
  get yaw() {
    return this._yaw;
  }
  set yaw(value) {
    this._yaw = value;
    this._needsUpdate = true;
  }
  _pitch;
  get pitch() {
    return this._pitch;
  }
  set pitch(value) {
    this._pitch = value;
    this._needsUpdate = true;
  }
  _needsUpdate;
  _restHeadWorldQuaternion;
  get euler() {
    console.warn("VRMLookAt: euler is deprecated. use getEuler() instead.");
    return this.getEuler(new THREE13.Euler);
  }
  constructor(humanoid, applier) {
    this.humanoid = humanoid;
    this.applier = applier;
    this._yaw = 0;
    this._pitch = 0;
    this._needsUpdate = true;
    this._restHeadWorldQuaternion = this.getLookAtWorldQuaternion(new THREE13.Quaternion);
  }
  getEuler(target) {
    return target.set(THREE13.MathUtils.DEG2RAD * this._pitch, THREE13.MathUtils.DEG2RAD * this._yaw, 0, "YXZ");
  }
  copy(source) {
    if (this.humanoid !== source.humanoid) {
      throw new Error("VRMLookAt: humanoid must be same in order to copy");
    }
    this.offsetFromHeadBone.copy(source.offsetFromHeadBone);
    this.applier = source.applier;
    this.autoUpdate = source.autoUpdate;
    this.target = source.target;
    this.faceFront.copy(source.faceFront);
    return this;
  }
  clone() {
    return new VRMLookAt(this.humanoid, this.applier).copy(this);
  }
  reset() {
    this._yaw = 0;
    this._pitch = 0;
    this._needsUpdate = true;
  }
  getLookAtWorldPosition(target) {
    const head = this.humanoid.getRawBoneNode("head");
    return target.copy(this.offsetFromHeadBone).applyMatrix4(head.matrixWorld);
  }
  getLookAtWorldQuaternion(target) {
    const head = this.humanoid.getRawBoneNode("head");
    return getWorldQuaternionLite(head, target);
  }
  getFaceFrontQuaternion(target) {
    if (this.faceFront.distanceToSquared(VEC3_POSITIVE_Z) < 0.01) {
      return target.copy(this._restHeadWorldQuaternion).invert();
    }
    const [faceFrontAzimuth, faceFrontAltitude] = calcAzimuthAltitude(this.faceFront);
    _eulerA.set(0, 0.5 * Math.PI + faceFrontAzimuth, faceFrontAltitude, "YZX");
    return target.setFromEuler(_eulerA).premultiply(_quatD.copy(this._restHeadWorldQuaternion).invert());
  }
  getLookAtWorldDirection(target) {
    this.getLookAtWorldQuaternion(_quatB2);
    this.getFaceFrontQuaternion(_quatC);
    return target.copy(VEC3_POSITIVE_Z).applyQuaternion(_quatB2).applyQuaternion(_quatC).applyEuler(this.getEuler(_eulerA));
  }
  lookAt(position) {
    const headRotDiffInv = _quatA5.copy(this._restHeadWorldQuaternion).multiply(quatInvertCompat(this.getLookAtWorldQuaternion(_quatB2)));
    const headPos = this.getLookAtWorldPosition(_v3B3);
    const lookAtDir = _v3C.copy(position).sub(headPos).applyQuaternion(headRotDiffInv).normalize();
    const [azimuthFrom, altitudeFrom] = calcAzimuthAltitude(this.faceFront);
    const [azimuthTo, altitudeTo] = calcAzimuthAltitude(lookAtDir);
    const yaw = sanitizeAngle(azimuthTo - azimuthFrom);
    const pitch = sanitizeAngle(altitudeFrom - altitudeTo);
    this._yaw = THREE13.MathUtils.RAD2DEG * yaw;
    this._pitch = THREE13.MathUtils.RAD2DEG * pitch;
    this._needsUpdate = true;
  }
  update(delta) {
    if (this.target != null && this.autoUpdate) {
      this.lookAt(this.target.getWorldPosition(_v3A5));
    }
    if (this._needsUpdate) {
      this._needsUpdate = false;
      this.applier.applyYawPitch(this._yaw, this._pitch);
    }
  }
}
// packages/three-vrm-core/src/lookAt/VRMLookAtBoneApplier.ts
import * as THREE14 from "three";
var VEC3_POSITIVE_Z2 = new THREE14.Vector3(0, 0, 1);
var _quatA6 = new THREE14.Quaternion;
var _quatB3 = new THREE14.Quaternion;
var _eulerA2 = new THREE14.Euler(0, 0, 0, "YXZ");

class VRMLookAtBoneApplier {
  static type = "bone";
  humanoid;
  rangeMapHorizontalInner;
  rangeMapHorizontalOuter;
  rangeMapVerticalDown;
  rangeMapVerticalUp;
  faceFront;
  _restQuatLeftEye;
  _restQuatRightEye;
  _restLeftEyeParentWorldQuat;
  _restRightEyeParentWorldQuat;
  constructor(humanoid, rangeMapHorizontalInner, rangeMapHorizontalOuter, rangeMapVerticalDown, rangeMapVerticalUp) {
    this.humanoid = humanoid;
    this.rangeMapHorizontalInner = rangeMapHorizontalInner;
    this.rangeMapHorizontalOuter = rangeMapHorizontalOuter;
    this.rangeMapVerticalDown = rangeMapVerticalDown;
    this.rangeMapVerticalUp = rangeMapVerticalUp;
    this.faceFront = new THREE14.Vector3(0, 0, 1);
    this._restQuatLeftEye = new THREE14.Quaternion;
    this._restQuatRightEye = new THREE14.Quaternion;
    this._restLeftEyeParentWorldQuat = new THREE14.Quaternion;
    this._restRightEyeParentWorldQuat = new THREE14.Quaternion;
    const leftEye = this.humanoid.getRawBoneNode("leftEye");
    const rightEye = this.humanoid.getRawBoneNode("rightEye");
    if (leftEye) {
      this._restQuatLeftEye.copy(leftEye.quaternion);
      getWorldQuaternionLite(leftEye.parent, this._restLeftEyeParentWorldQuat);
    }
    if (rightEye) {
      this._restQuatRightEye.copy(rightEye.quaternion);
      getWorldQuaternionLite(rightEye.parent, this._restRightEyeParentWorldQuat);
    }
  }
  applyYawPitch(yaw, pitch) {
    const leftEye = this.humanoid.getRawBoneNode("leftEye");
    const rightEye = this.humanoid.getRawBoneNode("rightEye");
    const leftEyeNormalized = this.humanoid.getNormalizedBoneNode("leftEye");
    const rightEyeNormalized = this.humanoid.getNormalizedBoneNode("rightEye");
    if (leftEye) {
      if (pitch < 0) {
        _eulerA2.x = -THREE14.MathUtils.DEG2RAD * this.rangeMapVerticalDown.map(-pitch);
      } else {
        _eulerA2.x = THREE14.MathUtils.DEG2RAD * this.rangeMapVerticalUp.map(pitch);
      }
      if (yaw < 0) {
        _eulerA2.y = -THREE14.MathUtils.DEG2RAD * this.rangeMapHorizontalInner.map(-yaw);
      } else {
        _eulerA2.y = THREE14.MathUtils.DEG2RAD * this.rangeMapHorizontalOuter.map(yaw);
      }
      _quatA6.setFromEuler(_eulerA2);
      this._getWorldFaceFrontQuat(_quatB3);
      leftEyeNormalized.quaternion.copy(_quatB3).multiply(_quatA6).multiply(_quatB3.invert());
      _quatA6.copy(this._restLeftEyeParentWorldQuat);
      leftEye.quaternion.copy(leftEyeNormalized.quaternion).multiply(_quatA6).premultiply(_quatA6.invert()).multiply(this._restQuatLeftEye);
    }
    if (rightEye) {
      if (pitch < 0) {
        _eulerA2.x = -THREE14.MathUtils.DEG2RAD * this.rangeMapVerticalDown.map(-pitch);
      } else {
        _eulerA2.x = THREE14.MathUtils.DEG2RAD * this.rangeMapVerticalUp.map(pitch);
      }
      if (yaw < 0) {
        _eulerA2.y = -THREE14.MathUtils.DEG2RAD * this.rangeMapHorizontalOuter.map(-yaw);
      } else {
        _eulerA2.y = THREE14.MathUtils.DEG2RAD * this.rangeMapHorizontalInner.map(yaw);
      }
      _quatA6.setFromEuler(_eulerA2);
      this._getWorldFaceFrontQuat(_quatB3);
      rightEyeNormalized.quaternion.copy(_quatB3).multiply(_quatA6).multiply(_quatB3.invert());
      _quatA6.copy(this._restRightEyeParentWorldQuat);
      rightEye.quaternion.copy(rightEyeNormalized.quaternion).multiply(_quatA6).premultiply(_quatA6.invert()).multiply(this._restQuatRightEye);
    }
  }
  lookAt(euler) {
    console.warn("VRMLookAtBoneApplier: lookAt() is deprecated. use apply() instead.");
    const yaw = THREE14.MathUtils.RAD2DEG * euler.y;
    const pitch = THREE14.MathUtils.RAD2DEG * euler.x;
    this.applyYawPitch(yaw, pitch);
  }
  _getWorldFaceFrontQuat(target) {
    if (this.faceFront.distanceToSquared(VEC3_POSITIVE_Z2) < 0.01) {
      return target.identity();
    }
    const [faceFrontAzimuth, faceFrontAltitude] = calcAzimuthAltitude(this.faceFront);
    _eulerA2.set(0, 0.5 * Math.PI + faceFrontAzimuth, faceFrontAltitude, "YZX");
    return target.setFromEuler(_eulerA2);
  }
}
// packages/three-vrm-core/src/lookAt/VRMLookAtExpressionApplier.ts
import * as THREE15 from "three";

class VRMLookAtExpressionApplier {
  static type = "expression";
  expressions;
  rangeMapHorizontalInner;
  rangeMapHorizontalOuter;
  rangeMapVerticalDown;
  rangeMapVerticalUp;
  constructor(expressions, rangeMapHorizontalInner, rangeMapHorizontalOuter, rangeMapVerticalDown, rangeMapVerticalUp) {
    this.expressions = expressions;
    this.rangeMapHorizontalInner = rangeMapHorizontalInner;
    this.rangeMapHorizontalOuter = rangeMapHorizontalOuter;
    this.rangeMapVerticalDown = rangeMapVerticalDown;
    this.rangeMapVerticalUp = rangeMapVerticalUp;
  }
  applyYawPitch(yaw, pitch) {
    if (pitch < 0) {
      this.expressions.setValue("lookDown", 0);
      this.expressions.setValue("lookUp", this.rangeMapVerticalUp.map(-pitch));
    } else {
      this.expressions.setValue("lookUp", 0);
      this.expressions.setValue("lookDown", this.rangeMapVerticalDown.map(pitch));
    }
    if (yaw < 0) {
      this.expressions.setValue("lookLeft", 0);
      this.expressions.setValue("lookRight", this.rangeMapHorizontalOuter.map(-yaw));
    } else {
      this.expressions.setValue("lookRight", 0);
      this.expressions.setValue("lookLeft", this.rangeMapHorizontalOuter.map(yaw));
    }
  }
  lookAt(euler) {
    console.warn("VRMLookAtBoneApplier: lookAt() is deprecated. use apply() instead.");
    const yaw = THREE15.MathUtils.RAD2DEG * euler.y;
    const pitch = THREE15.MathUtils.RAD2DEG * euler.x;
    this.applyYawPitch(yaw, pitch);
  }
}
// packages/three-vrm-core/src/lookAt/VRMLookAtRangeMap.ts
class VRMLookAtRangeMap {
  inputMaxValue;
  outputScale;
  constructor(inputMaxValue, outputScale) {
    this.inputMaxValue = inputMaxValue;
    this.outputScale = outputScale;
  }
  map(src) {
    return this.outputScale * saturate(src / this.inputMaxValue);
  }
}

// packages/three-vrm-core/src/lookAt/VRMLookAtLoaderPlugin.ts
var POSSIBLE_SPEC_VERSIONS4 = new Set(["1.0", "1.0-beta"]);
var INPUT_MAX_VALUE_MINIMUM = 0.01;

class VRMLookAtLoaderPlugin {
  helperRoot;
  parser;
  get name() {
    return "VRMLookAtLoaderPlugin";
  }
  constructor(parser, options) {
    this.parser = parser;
    this.helperRoot = options?.helperRoot;
  }
  async afterRoot(gltf) {
    const vrmHumanoid = gltf.userData.vrmHumanoid;
    if (vrmHumanoid === null) {
      return;
    } else if (vrmHumanoid === undefined) {
      throw new Error("VRMLookAtLoaderPlugin: vrmHumanoid is undefined. VRMHumanoidLoaderPlugin have to be used first");
    }
    const vrmExpressionManager = gltf.userData.vrmExpressionManager;
    if (vrmExpressionManager === null) {
      return;
    } else if (vrmExpressionManager === undefined) {
      throw new Error("VRMLookAtLoaderPlugin: vrmExpressionManager is undefined. VRMExpressionLoaderPlugin have to be used first");
    }
    gltf.userData.vrmLookAt = await this._import(gltf, vrmHumanoid, vrmExpressionManager);
  }
  async _import(gltf, humanoid, expressions) {
    if (humanoid == null || expressions == null) {
      return null;
    }
    const v1Result = await this._v1Import(gltf, humanoid, expressions);
    if (v1Result) {
      return v1Result;
    }
    const v0Result = await this._v0Import(gltf, humanoid, expressions);
    if (v0Result) {
      return v0Result;
    }
    return null;
  }
  async _v1Import(gltf, humanoid, expressions) {
    const json = this.parser.json;
    const isVRMUsed = json.extensionsUsed?.indexOf("VRMC_vrm") !== -1;
    if (!isVRMUsed) {
      return null;
    }
    const extension = json.extensions?.["VRMC_vrm"];
    if (!extension) {
      return null;
    }
    const specVersion = extension.specVersion;
    if (!POSSIBLE_SPEC_VERSIONS4.has(specVersion)) {
      console.warn(`VRMLookAtLoaderPlugin: Unknown VRMC_vrm specVersion "${specVersion}"`);
      return null;
    }
    const schemaLookAt = extension.lookAt;
    if (!schemaLookAt) {
      return null;
    }
    const defaultOutputScale = schemaLookAt.type === "expression" ? 1 : 10;
    const mapHI = this._v1ImportRangeMap(schemaLookAt.rangeMapHorizontalInner, defaultOutputScale);
    const mapHO = this._v1ImportRangeMap(schemaLookAt.rangeMapHorizontalOuter, defaultOutputScale);
    const mapVD = this._v1ImportRangeMap(schemaLookAt.rangeMapVerticalDown, defaultOutputScale);
    const mapVU = this._v1ImportRangeMap(schemaLookAt.rangeMapVerticalUp, defaultOutputScale);
    let applier;
    if (schemaLookAt.type === "expression") {
      applier = new VRMLookAtExpressionApplier(expressions, mapHI, mapHO, mapVD, mapVU);
    } else {
      applier = new VRMLookAtBoneApplier(humanoid, mapHI, mapHO, mapVD, mapVU);
    }
    const lookAt = this._importLookAt(humanoid, applier);
    lookAt.offsetFromHeadBone.fromArray(schemaLookAt.offsetFromHeadBone ?? [0, 0.06, 0]);
    return lookAt;
  }
  _v1ImportRangeMap(schemaRangeMap, defaultOutputScale) {
    let inputMaxValue = schemaRangeMap?.inputMaxValue ?? 90;
    const outputScale = schemaRangeMap?.outputScale ?? defaultOutputScale;
    if (inputMaxValue < INPUT_MAX_VALUE_MINIMUM) {
      console.warn("VRMLookAtLoaderPlugin: inputMaxValue of a range map is too small. Consider reviewing the range map!");
      inputMaxValue = INPUT_MAX_VALUE_MINIMUM;
    }
    return new VRMLookAtRangeMap(inputMaxValue, outputScale);
  }
  async _v0Import(gltf, humanoid, expressions) {
    const json = this.parser.json;
    const vrmExt = json.extensions?.VRM;
    if (!vrmExt) {
      return null;
    }
    const schemaFirstPerson = vrmExt.firstPerson;
    if (!schemaFirstPerson) {
      return null;
    }
    const defaultOutputScale = schemaFirstPerson.lookAtTypeName === "BlendShape" ? 1 : 10;
    const mapHI = this._v0ImportDegreeMap(schemaFirstPerson.lookAtHorizontalInner, defaultOutputScale);
    const mapHO = this._v0ImportDegreeMap(schemaFirstPerson.lookAtHorizontalOuter, defaultOutputScale);
    const mapVD = this._v0ImportDegreeMap(schemaFirstPerson.lookAtVerticalDown, defaultOutputScale);
    const mapVU = this._v0ImportDegreeMap(schemaFirstPerson.lookAtVerticalUp, defaultOutputScale);
    let applier;
    if (schemaFirstPerson.lookAtTypeName === "BlendShape") {
      applier = new VRMLookAtExpressionApplier(expressions, mapHI, mapHO, mapVD, mapVU);
    } else {
      applier = new VRMLookAtBoneApplier(humanoid, mapHI, mapHO, mapVD, mapVU);
    }
    const lookAt = this._importLookAt(humanoid, applier);
    if (schemaFirstPerson.firstPersonBoneOffset) {
      lookAt.offsetFromHeadBone.set(schemaFirstPerson.firstPersonBoneOffset.x ?? 0, schemaFirstPerson.firstPersonBoneOffset.y ?? 0.06, -(schemaFirstPerson.firstPersonBoneOffset.z ?? 0));
    } else {
      lookAt.offsetFromHeadBone.set(0, 0.06, 0);
    }
    lookAt.faceFront.set(0, 0, -1);
    if (applier instanceof VRMLookAtBoneApplier) {
      applier.faceFront.set(0, 0, -1);
    }
    return lookAt;
  }
  _v0ImportDegreeMap(schemaDegreeMap, defaultOutputScale) {
    const curve = schemaDegreeMap?.curve;
    if (JSON.stringify(curve) !== "[0,0,0,1,1,1,1,0]") {
      console.warn("Curves of LookAtDegreeMap defined in VRM 0.0 are not supported");
    }
    let xRange = schemaDegreeMap?.xRange ?? 90;
    const yRange = schemaDegreeMap?.yRange ?? defaultOutputScale;
    if (xRange < INPUT_MAX_VALUE_MINIMUM) {
      console.warn("VRMLookAtLoaderPlugin: xRange of a degree map is too small. Consider reviewing the degree map!");
      xRange = INPUT_MAX_VALUE_MINIMUM;
    }
    return new VRMLookAtRangeMap(xRange, yRange);
  }
  _importLookAt(humanoid, applier) {
    const lookAt = new VRMLookAt(humanoid, applier);
    if (this.helperRoot) {
      const helper = new VRMLookAtHelper(lookAt);
      this.helperRoot.add(helper);
      helper.renderOrder = this.helperRoot.renderOrder;
    }
    return lookAt;
  }
}
// packages/three-vrm-core/src/lookAt/VRMLookAtTypeName.ts
var VRMLookAtTypeName = {
  Bone: "bone",
  Expression: "expression"
};
// packages/three-vrm-core/src/meta/VRMMetaLoaderPlugin.ts
import * as THREE16 from "three";

// packages/three-vrm-core/src/utils/resolveURL.ts
function resolveURL(url, path) {
  if (typeof url !== "string" || url === "")
    return "";
  if (/^https?:\/\//i.test(path) && /^\//.test(url)) {
    path = path.replace(/(^https?:\/\/[^/]+).*/i, "$1");
  }
  if (/^(https?:)?\/\//i.test(url))
    return url;
  if (/^data:.*,.*$/i.test(url))
    return url;
  if (/^blob:.*$/i.test(url))
    return url;
  return path + url;
}

// packages/three-vrm-core/src/meta/VRMMetaLoaderPlugin.ts
var POSSIBLE_SPEC_VERSIONS5 = new Set(["1.0", "1.0-beta"]);

class VRMMetaLoaderPlugin {
  parser;
  needThumbnailImage;
  acceptLicenseUrls;
  acceptV0Meta;
  get name() {
    return "VRMMetaLoaderPlugin";
  }
  constructor(parser, options) {
    this.parser = parser;
    this.needThumbnailImage = options?.needThumbnailImage ?? false;
    this.acceptLicenseUrls = options?.acceptLicenseUrls ?? ["https://vrm.dev/licenses/1.0/"];
    this.acceptV0Meta = options?.acceptV0Meta ?? true;
  }
  async afterRoot(gltf) {
    gltf.userData.vrmMeta = await this._import(gltf);
  }
  async _import(gltf) {
    const v1Result = await this._v1Import(gltf);
    if (v1Result != null) {
      return v1Result;
    }
    const v0Result = await this._v0Import(gltf);
    if (v0Result != null) {
      return v0Result;
    }
    return null;
  }
  async _v1Import(gltf) {
    const json = this.parser.json;
    const isVRMUsed = json.extensionsUsed?.indexOf("VRMC_vrm") !== -1;
    if (!isVRMUsed) {
      return null;
    }
    const extension = json.extensions?.["VRMC_vrm"];
    if (extension == null) {
      return null;
    }
    const specVersion = extension.specVersion;
    if (!POSSIBLE_SPEC_VERSIONS5.has(specVersion)) {
      console.warn(`VRMMetaLoaderPlugin: Unknown VRMC_vrm specVersion "${specVersion}"`);
      return null;
    }
    const schemaMeta = extension.meta;
    if (!schemaMeta) {
      return null;
    }
    const licenseUrl = schemaMeta.licenseUrl;
    const acceptLicenseUrlsSet = new Set(this.acceptLicenseUrls);
    if (!acceptLicenseUrlsSet.has(licenseUrl)) {
      throw new Error(`VRMMetaLoaderPlugin: The license url "${licenseUrl}" is not accepted`);
    }
    let thumbnailImage = undefined;
    if (this.needThumbnailImage && schemaMeta.thumbnailImage != null) {
      thumbnailImage = await this._extractGLTFImage(schemaMeta.thumbnailImage) ?? undefined;
    }
    return {
      metaVersion: "1",
      name: schemaMeta.name,
      version: schemaMeta.version,
      authors: schemaMeta.authors,
      copyrightInformation: schemaMeta.copyrightInformation,
      contactInformation: schemaMeta.contactInformation,
      references: schemaMeta.references,
      thirdPartyLicenses: schemaMeta.thirdPartyLicenses,
      thumbnailImage,
      licenseUrl: schemaMeta.licenseUrl,
      avatarPermission: schemaMeta.avatarPermission,
      allowExcessivelyViolentUsage: schemaMeta.allowExcessivelyViolentUsage,
      allowExcessivelySexualUsage: schemaMeta.allowExcessivelySexualUsage,
      commercialUsage: schemaMeta.commercialUsage,
      allowPoliticalOrReligiousUsage: schemaMeta.allowPoliticalOrReligiousUsage,
      allowAntisocialOrHateUsage: schemaMeta.allowAntisocialOrHateUsage,
      creditNotation: schemaMeta.creditNotation,
      allowRedistribution: schemaMeta.allowRedistribution,
      modification: schemaMeta.modification,
      otherLicenseUrl: schemaMeta.otherLicenseUrl
    };
  }
  async _v0Import(gltf) {
    const json = this.parser.json;
    const vrmExt = json.extensions?.VRM;
    if (!vrmExt) {
      return null;
    }
    const schemaMeta = vrmExt.meta;
    if (!schemaMeta) {
      return null;
    }
    if (!this.acceptV0Meta) {
      throw new Error("VRMMetaLoaderPlugin: Attempted to load VRM0.0 meta but acceptV0Meta is false");
    }
    let texture;
    if (this.needThumbnailImage && schemaMeta.texture != null && schemaMeta.texture !== -1) {
      texture = await this.parser.getDependency("texture", schemaMeta.texture);
    }
    return {
      metaVersion: "0",
      allowedUserName: schemaMeta.allowedUserName,
      author: schemaMeta.author,
      commercialUssageName: schemaMeta.commercialUssageName,
      contactInformation: schemaMeta.contactInformation,
      licenseName: schemaMeta.licenseName,
      otherLicenseUrl: schemaMeta.otherLicenseUrl,
      otherPermissionUrl: schemaMeta.otherPermissionUrl,
      reference: schemaMeta.reference,
      sexualUssageName: schemaMeta.sexualUssageName,
      texture: texture ?? undefined,
      title: schemaMeta.title,
      version: schemaMeta.version,
      violentUssageName: schemaMeta.violentUssageName
    };
  }
  async _extractGLTFImage(index) {
    const json = this.parser.json;
    const source = json.images?.[index];
    if (source == null) {
      console.warn(`VRMMetaLoaderPlugin: Attempt to use images[${index}] of glTF as a thumbnail but the image doesn't exist`);
      return null;
    }
    let sourceURI = source.uri;
    if (source.bufferView != null) {
      const bufferView = await this.parser.getDependency("bufferView", source.bufferView);
      const blob = new Blob([bufferView], { type: source.mimeType });
      sourceURI = URL.createObjectURL(blob);
    }
    if (sourceURI == null) {
      console.warn(`VRMMetaLoaderPlugin: Attempt to use images[${index}] of glTF as a thumbnail but the image couldn't load properly`);
      return null;
    }
    const loader = new THREE16.ImageLoader;
    return await loader.loadAsync(resolveURL(sourceURI, this.parser.options.path)).catch((error) => {
      console.error(error);
      console.warn("VRMMetaLoaderPlugin: Failed to load a thumbnail image");
      return null;
    });
  }
}
// packages/three-vrm-core/src/VRMCore.ts
class VRMCore {
  scene;
  meta;
  humanoid;
  expressionManager;
  firstPerson;
  lookAt;
  constructor(params) {
    this.scene = params.scene;
    this.meta = params.meta;
    this.humanoid = params.humanoid;
    this.expressionManager = params.expressionManager;
    this.firstPerson = params.firstPerson;
    this.lookAt = params.lookAt;
  }
  update(delta) {
    this.humanoid.update();
    if (this.lookAt) {
      this.lookAt.update(delta);
    }
    if (this.expressionManager) {
      this.expressionManager.update();
    }
  }
}
// packages/three-vrm-core/src/VRMCoreLoaderPlugin.ts
class VRMCoreLoaderPlugin {
  get name() {
    return "VRMC_vrm";
  }
  parser;
  expressionPlugin;
  firstPersonPlugin;
  humanoidPlugin;
  lookAtPlugin;
  metaPlugin;
  constructor(parser, options) {
    this.parser = parser;
    const helperRoot = options?.helperRoot;
    const autoUpdateHumanBones = options?.autoUpdateHumanBones;
    this.expressionPlugin = options?.expressionPlugin ?? new VRMExpressionLoaderPlugin(parser);
    this.firstPersonPlugin = options?.firstPersonPlugin ?? new VRMFirstPersonLoaderPlugin(parser);
    this.humanoidPlugin = options?.humanoidPlugin ?? new VRMHumanoidLoaderPlugin(parser, { helperRoot, autoUpdateHumanBones });
    this.lookAtPlugin = options?.lookAtPlugin ?? new VRMLookAtLoaderPlugin(parser, { helperRoot });
    this.metaPlugin = options?.metaPlugin ?? new VRMMetaLoaderPlugin(parser);
  }
  async afterRoot(gltf) {
    await this.metaPlugin.afterRoot(gltf);
    await this.humanoidPlugin.afterRoot(gltf);
    await this.expressionPlugin.afterRoot(gltf);
    await this.lookAtPlugin.afterRoot(gltf);
    await this.firstPersonPlugin.afterRoot(gltf);
    const meta = gltf.userData.vrmMeta;
    const humanoid = gltf.userData.vrmHumanoid;
    if (meta && humanoid) {
      const vrmCore = new VRMCore({
        scene: gltf.scene,
        expressionManager: gltf.userData.vrmExpressionManager,
        firstPerson: gltf.userData.vrmFirstPerson,
        humanoid,
        lookAt: gltf.userData.vrmLookAt,
        meta
      });
      gltf.userData.vrmCore = vrmCore;
    }
  }
}
// packages/three-vrm/src/VRM.ts
class VRM extends VRMCore {
  materials;
  springBoneManager;
  nodeConstraintManager;
  constructor(params) {
    super(params);
    this.materials = params.materials;
    this.springBoneManager = params.springBoneManager;
    this.nodeConstraintManager = params.nodeConstraintManager;
  }
  update(delta) {
    super.update(delta);
    if (this.nodeConstraintManager) {
      this.nodeConstraintManager.update();
    }
    if (this.springBoneManager) {
      this.springBoneManager.update(delta);
    }
    if (this.materials) {
      this.materials.forEach((material) => {
        if (material.update) {
          material.update(delta);
        }
      });
    }
  }
}
// packages/three-vrm-materials-mtoon/src/MToonMaterialLoaderPlugin.ts
import * as THREE21 from "three";

// packages/three-vrm-materials-mtoon/src/GLTFMToonMaterialParamsAssignHelper.ts
import * as THREE18 from "three";

// packages/three-vrm-materials-mtoon/src/utils/setTextureColorSpace.ts
import * as THREE17 from "three";
var colorSpaceEncodingMap = {
  "": 3000,
  srgb: 3001
};
function setTextureColorSpace(texture, colorSpace) {
  if (parseInt(THREE17.REVISION, 10) >= 152) {
    texture.colorSpace = colorSpace;
  } else {
    texture.encoding = colorSpaceEncodingMap[colorSpace];
  }
}

// packages/three-vrm-materials-mtoon/src/GLTFMToonMaterialParamsAssignHelper.ts
class GLTFMToonMaterialParamsAssignHelper {
  _parser;
  _materialParams;
  _pendings;
  get pending() {
    return Promise.all(this._pendings);
  }
  constructor(parser, materialParams) {
    this._parser = parser;
    this._materialParams = materialParams;
    this._pendings = [];
  }
  assignPrimitive(key, value) {
    if (value != null) {
      this._materialParams[key] = value;
    }
  }
  assignColor(key, value, convertSRGBToLinear) {
    if (value != null) {
      this._materialParams[key] = new THREE18.Color().fromArray(value);
      if (convertSRGBToLinear) {
        this._materialParams[key].convertSRGBToLinear();
      }
    }
  }
  async assignTexture(key, texture, isColorTexture) {
    const promise = (async () => {
      if (texture != null) {
        await this._parser.assignTexture(this._materialParams, key, texture);
        if (isColorTexture) {
          setTextureColorSpace(this._materialParams[key], "srgb");
        }
      }
    })();
    this._pendings.push(promise);
    return promise;
  }
  async assignTextureByIndex(key, textureIndex, isColorTexture) {
    return this.assignTexture(key, textureIndex != null ? { index: textureIndex } : undefined, isColorTexture);
  }
}

// packages/three-vrm-materials-mtoon/src/MToonMaterial.ts
import * as THREE20 from "three";

// packages/three-vrm-materials-mtoon/src/shaders/mtoon.vert
var mtoon_default = `// #define PHONG

varying vec3 vViewPosition;

#ifndef FLAT_SHADED
  varying vec3 vNormal;
#endif

#include <common>

// #include <uv_pars_vertex>
#ifdef MTOON_USE_UV
  varying vec2 vUv;

  // COMPAT: pre-r151 uses a common uvTransform
  #if THREE_VRM_THREE_REVISION < 151
    uniform mat3 uvTransform;
  #endif
#endif

// #include <uv2_pars_vertex>
// COMAPT: pre-r151 uses uv2 for lightMap and aoMap
#if THREE_VRM_THREE_REVISION < 151
  #if defined( USE_LIGHTMAP ) || defined( USE_AOMAP )
    attribute vec2 uv2;
    varying vec2 vUv2;
    uniform mat3 uv2Transform;
  #endif
#endif

// #include <displacementmap_pars_vertex>
// #include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

#ifdef USE_OUTLINEWIDTHMULTIPLYTEXTURE
  uniform sampler2D outlineWidthMultiplyTexture;
  uniform mat3 outlineWidthMultiplyTextureUvTransform;
#endif

uniform float outlineWidthFactor;

void main() {

  // #include <uv_vertex>
  #ifdef MTOON_USE_UV
    // COMPAT: pre-r151 uses a common uvTransform
    #if THREE_VRM_THREE_REVISION >= 151
      vUv = uv;
    #else
      vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
    #endif
  #endif

  // #include <uv2_vertex>
  // COMAPT: pre-r151 uses uv2 for lightMap and aoMap
  #if THREE_VRM_THREE_REVISION < 151
    #if defined( USE_LIGHTMAP ) || defined( USE_AOMAP )
      vUv2 = ( uv2Transform * vec3( uv2, 1 ) ).xy;
    #endif
  #endif

  #include <color_vertex>

  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>

  // we need this to compute the outline properly
  objectNormal = normalize( objectNormal );

  #include <defaultnormal_vertex>

  #ifndef FLAT_SHADED // Normal computed with derivatives when FLAT_SHADED
    vNormal = normalize( transformedNormal );
  #endif

  #include <begin_vertex>

  #include <morphtarget_vertex>
  #include <skinning_vertex>
  // #include <displacementmap_vertex>
  #include <project_vertex>
  #include <logdepthbuf_vertex>
  #include <clipping_planes_vertex>

  vViewPosition = - mvPosition.xyz;

  float outlineTex = 1.0;

  #ifdef OUTLINE
    #ifdef USE_OUTLINEWIDTHMULTIPLYTEXTURE
      vec2 outlineWidthMultiplyTextureUv = ( outlineWidthMultiplyTextureUvTransform * vec3( vUv, 1 ) ).xy;
      outlineTex = texture2D( outlineWidthMultiplyTexture, outlineWidthMultiplyTextureUv ).g;
    #endif

    #ifdef OUTLINE_WIDTH_WORLD
      float worldNormalLength = length( transformedNormal );
      vec3 outlineOffset = outlineWidthFactor * outlineTex * worldNormalLength * objectNormal;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( outlineOffset + transformed, 1.0 );
    #endif

    #ifdef OUTLINE_WIDTH_SCREEN
      vec3 clipNormal = ( projectionMatrix * modelViewMatrix * vec4( objectNormal, 0.0 ) ).xyz;
      vec2 projectedNormal = normalize( clipNormal.xy );
      projectedNormal.x *= projectionMatrix[ 0 ].x / projectionMatrix[ 1 ].y;
      gl_Position.xy += 2.0 * outlineWidthFactor * outlineTex * projectedNormal.xy;
    #endif

    gl_Position.z += 1E-6 * gl_Position.w; // anti-artifact magic
  #endif

  #include <worldpos_vertex>
  // #include <envmap_vertex>
  #include <shadowmap_vertex>
  #include <fog_vertex>

}`;

// packages/three-vrm-materials-mtoon/src/shaders/mtoon.frag
var mtoon_default2 = `// #define PHONG

uniform vec3 litFactor;

uniform float opacity;

uniform vec3 shadeColorFactor;
#ifdef USE_SHADEMULTIPLYTEXTURE
  uniform sampler2D shadeMultiplyTexture;
  uniform mat3 shadeMultiplyTextureUvTransform;
#endif

uniform float shadingShiftFactor;
uniform float shadingToonyFactor;

#ifdef USE_SHADINGSHIFTTEXTURE
  uniform sampler2D shadingShiftTexture;
  uniform mat3 shadingShiftTextureUvTransform;
  uniform float shadingShiftTextureScale;
#endif

uniform float giEqualizationFactor;

uniform vec3 parametricRimColorFactor;
#ifdef USE_RIMMULTIPLYTEXTURE
  uniform sampler2D rimMultiplyTexture;
  uniform mat3 rimMultiplyTextureUvTransform;
#endif
uniform float rimLightingMixFactor;
uniform float parametricRimFresnelPowerFactor;
uniform float parametricRimLiftFactor;

#ifdef USE_MATCAPTEXTURE
  uniform vec3 matcapFactor;
  uniform sampler2D matcapTexture;
  uniform mat3 matcapTextureUvTransform;
#endif

uniform vec3 emissive;
uniform float emissiveIntensity;

uniform vec3 outlineColorFactor;
uniform float outlineLightingMixFactor;

#ifdef USE_UVANIMATIONMASKTEXTURE
  uniform sampler2D uvAnimationMaskTexture;
  uniform mat3 uvAnimationMaskTextureUvTransform;
#endif

uniform float uvAnimationScrollXOffset;
uniform float uvAnimationScrollYOffset;
uniform float uvAnimationRotationPhase;

#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>

// #include <uv_pars_fragment>
#if ( defined( MTOON_USE_UV ) && !defined( MTOON_UVS_VERTEX_ONLY ) )
  varying vec2 vUv;
#endif

// #include <uv2_pars_fragment>
// COMAPT: pre-r151 uses uv2 for lightMap and aoMap
#if THREE_VRM_THREE_REVISION < 151
  #if defined( USE_LIGHTMAP ) || defined( USE_AOMAP )
    varying vec2 vUv2;
  #endif
#endif

#include <map_pars_fragment>

#ifdef USE_MAP
  uniform mat3 mapUvTransform;
#endif

// #include <alphamap_pars_fragment>

#include <alphatest_pars_fragment>

#include <aomap_pars_fragment>
// #include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>

#ifdef USE_EMISSIVEMAP
  uniform mat3 emissiveMapUvTransform;
#endif

// #include <envmap_common_pars_fragment>
// #include <envmap_pars_fragment>
// #include <cube_uv_reflection_fragment>
#include <fog_pars_fragment>

// #include <bsdfs>
// COMPAT: pre-r151 doesn't have BRDF_Lambert in <common>
#if THREE_VRM_THREE_REVISION < 151
  vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
    return RECIPROCAL_PI * diffuseColor;
  }
#endif

#include <lights_pars_begin>

#include <normal_pars_fragment>

// #include <lights_phong_pars_fragment>
varying vec3 vViewPosition;

struct MToonMaterial {
  vec3 diffuseColor;
  vec3 shadeColor;
  float shadingShift;
};

float linearstep( float a, float b, float t ) {
  return clamp( ( t - a ) / ( b - a ), 0.0, 1.0 );
}

/**
 * Convert NdotL into toon shading factor using shadingShift and shadingToony
 */
float getShading(
  const in float dotNL,
  const in float shadow,
  const in float shadingShift
) {
  float shading = dotNL;
  shading = shading + shadingShift;
  shading = linearstep( -1.0 + shadingToonyFactor, 1.0 - shadingToonyFactor, shading );
  shading *= shadow;
  return shading;
}

/**
 * Mix diffuseColor and shadeColor using shading factor and light color
 */
vec3 getDiffuse(
  const in MToonMaterial material,
  const in float shading,
  in vec3 lightColor
) {
  #ifdef DEBUG_LITSHADERATE
    return vec3( BRDF_Lambert( shading * lightColor ) );
  #endif

  vec3 col = lightColor * BRDF_Lambert( mix( material.shadeColor, material.diffuseColor, shading ) );

  // The "comment out if you want to PBR absolutely" line
  #ifdef V0_COMPAT_SHADE
    col = min( col, material.diffuseColor );
  #endif

  return col;
}

// COMPAT: pre-r156 uses a struct GeometricContext
#if THREE_VRM_THREE_REVISION >= 157
  void RE_Direct_MToon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in MToonMaterial material, const in float shadow, inout ReflectedLight reflectedLight ) {
    float dotNL = clamp( dot( geometryNormal, directLight.direction ), -1.0, 1.0 );
    vec3 irradiance = directLight.color;

    // directSpecular will be used for rim lighting, not an actual specular
    reflectedLight.directSpecular += irradiance;

    irradiance *= dotNL;

    float shading = getShading( dotNL, shadow, material.shadingShift );

    // toon shaded diffuse
    reflectedLight.directDiffuse += getDiffuse( material, shading, directLight.color );
  }

  void RE_IndirectDiffuse_MToon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in MToonMaterial material, inout ReflectedLight reflectedLight ) {
    // indirect diffuse will use diffuseColor, no shadeColor involved
    reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

    // directSpecular will be used for rim lighting, not an actual specular
    reflectedLight.directSpecular += irradiance;
  }
#else
  void RE_Direct_MToon( const in IncidentLight directLight, const in GeometricContext geometry, const in MToonMaterial material, const in float shadow, inout ReflectedLight reflectedLight ) {
    float dotNL = clamp( dot( geometry.normal, directLight.direction ), -1.0, 1.0 );
    vec3 irradiance = directLight.color;

    // directSpecular will be used for rim lighting, not an actual specular
    reflectedLight.directSpecular += irradiance;

    irradiance *= dotNL;

    float shading = getShading( dotNL, shadow, material.shadingShift );

    // toon shaded diffuse
    reflectedLight.directDiffuse += getDiffuse( material, shading, directLight.color );
  }

  void RE_IndirectDiffuse_MToon( const in vec3 irradiance, const in GeometricContext geometry, const in MToonMaterial material, inout ReflectedLight reflectedLight ) {
    // indirect diffuse will use diffuseColor, no shadeColor involved
    reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );

    // directSpecular will be used for rim lighting, not an actual specular
    reflectedLight.directSpecular += irradiance;
  }
#endif

#define RE_Direct RE_Direct_MToon
#define RE_IndirectDiffuse RE_IndirectDiffuse_MToon
#define Material_LightProbeLOD( material ) (0)

#include <shadowmap_pars_fragment>
// #include <bumpmap_pars_fragment>

// #include <normalmap_pars_fragment>
#ifdef USE_NORMALMAP

  uniform sampler2D normalMap;
  uniform mat3 normalMapUvTransform;
  uniform vec2 normalScale;

#endif

// COMPAT: pre-r151
// USE_NORMALMAP_OBJECTSPACE used to be OBJECTSPACE_NORMALMAP in pre-r151
#if defined( USE_NORMALMAP_OBJECTSPACE ) || defined( OBJECTSPACE_NORMALMAP )

  uniform mat3 normalMatrix;

#endif

// COMPAT: pre-r151
// USE_NORMALMAP_TANGENTSPACE used to be TANGENTSPACE_NORMALMAP in pre-r151
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( TANGENTSPACE_NORMALMAP ) )

  // Per-Pixel Tangent Space Normal Mapping
  // http://hacksoflife.blogspot.ch/2009/11/per-pixel-tangent-space-normal-mapping.html

  // three-vrm specific change: it requires \`uv\` as an input in order to support uv scrolls

  // Temporary compat against shader change @ Three.js r126, r151
  #if THREE_VRM_THREE_REVISION >= 151

    mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {

      vec3 q0 = dFdx( eye_pos.xyz );
      vec3 q1 = dFdy( eye_pos.xyz );
      vec2 st0 = dFdx( uv.st );
      vec2 st1 = dFdy( uv.st );

      vec3 N = surf_norm;

      vec3 q1perp = cross( q1, N );
      vec3 q0perp = cross( N, q0 );

      vec3 T = q1perp * st0.x + q0perp * st1.x;
      vec3 B = q1perp * st0.y + q0perp * st1.y;

      float det = max( dot( T, T ), dot( B, B ) );
      float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );

      return mat3( T * scale, B * scale, N );

    }

  #else

    vec3 perturbNormal2Arb( vec2 uv, vec3 eye_pos, vec3 surf_norm, vec3 mapN, float faceDirection ) {

      vec3 q0 = vec3( dFdx( eye_pos.x ), dFdx( eye_pos.y ), dFdx( eye_pos.z ) );
      vec3 q1 = vec3( dFdy( eye_pos.x ), dFdy( eye_pos.y ), dFdy( eye_pos.z ) );
      vec2 st0 = dFdx( uv.st );
      vec2 st1 = dFdy( uv.st );

      vec3 N = normalize( surf_norm );

      vec3 q1perp = cross( q1, N );
      vec3 q0perp = cross( N, q0 );

      vec3 T = q1perp * st0.x + q0perp * st1.x;
      vec3 B = q1perp * st0.y + q0perp * st1.y;

      // three-vrm specific change: Workaround for the issue that happens when delta of uv = 0.0
      // TODO: Is this still required? Or shall I make a PR about it?
      if ( length( T ) == 0.0 || length( B ) == 0.0 ) {
        return surf_norm;
      }

      float det = max( dot( T, T ), dot( B, B ) );
      float scale = ( det == 0.0 ) ? 0.0 : faceDirection * inversesqrt( det );

      return normalize( T * ( mapN.x * scale ) + B * ( mapN.y * scale ) + N * mapN.z );

    }

  #endif

#endif

// #include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>

// == post correction ==========================================================
void postCorrection() {
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <premultiplied_alpha_fragment>
  #include <dithering_fragment>
}

// == main procedure ===========================================================
void main() {
  #include <clipping_planes_fragment>

  vec2 uv = vec2(0.5, 0.5);

  #if ( defined( MTOON_USE_UV ) && !defined( MTOON_UVS_VERTEX_ONLY ) )
    uv = vUv;

    float uvAnimMask = 1.0;
    #ifdef USE_UVANIMATIONMASKTEXTURE
      vec2 uvAnimationMaskTextureUv = ( uvAnimationMaskTextureUvTransform * vec3( uv, 1 ) ).xy;
      uvAnimMask = texture2D( uvAnimationMaskTexture, uvAnimationMaskTextureUv ).b;
    #endif

    float uvRotCos = cos( uvAnimationRotationPhase * uvAnimMask );
    float uvRotSin = sin( uvAnimationRotationPhase * uvAnimMask );
    uv = mat2( uvRotCos, -uvRotSin, uvRotSin, uvRotCos ) * ( uv - 0.5 ) + 0.5;
    uv = uv + vec2( uvAnimationScrollXOffset, uvAnimationScrollYOffset ) * uvAnimMask;
  #endif

  #ifdef DEBUG_UV
    gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
    #if ( defined( MTOON_USE_UV ) && !defined( MTOON_UVS_VERTEX_ONLY ) )
      gl_FragColor = vec4( uv, 0.0, 1.0 );
    #endif
    return;
  #endif

  vec4 diffuseColor = vec4( litFactor, opacity );
  ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
  vec3 totalEmissiveRadiance = emissive * emissiveIntensity;

  #include <logdepthbuf_fragment>

  // #include <map_fragment>
  #ifdef USE_MAP
    vec2 mapUv = ( mapUvTransform * vec3( uv, 1 ) ).xy;
    vec4 sampledDiffuseColor = texture2D( map, mapUv );
    #ifdef DECODE_VIDEO_TEXTURE
      sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
    #endif
    diffuseColor *= sampledDiffuseColor;
  #endif

  // #include <color_fragment>
  #if ( defined( USE_COLOR ) && !defined( IGNORE_VERTEX_COLOR ) )
    diffuseColor.rgb *= vColor;
  #endif

  // #include <alphamap_fragment>

  #include <alphatest_fragment>

  // #include <specularmap_fragment>

  // #include <normal_fragment_begin>
  float faceDirection = gl_FrontFacing ? 1.0 : -1.0;

  #ifdef FLAT_SHADED

    vec3 fdx = dFdx( vViewPosition );
    vec3 fdy = dFdy( vViewPosition );
    vec3 normal = normalize( cross( fdx, fdy ) );

  #else

    vec3 normal = normalize( vNormal );

    #ifdef DOUBLE_SIDED

      normal *= faceDirection;

    #endif

  #endif

  #ifdef USE_NORMALMAP

    vec2 normalMapUv = ( normalMapUvTransform * vec3( uv, 1 ) ).xy;

  #endif

  #ifdef USE_NORMALMAP_TANGENTSPACE

    #ifdef USE_TANGENT

      mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );

    #else

      mat3 tbn = getTangentFrame( - vViewPosition, normal, normalMapUv );

    #endif

    #if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )

      tbn[0] *= faceDirection;
      tbn[1] *= faceDirection;

    #endif

  #endif

  #ifdef USE_CLEARCOAT_NORMALMAP

    #ifdef USE_TANGENT

      mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );

    #else

      mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );

    #endif

    #if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )

      tbn2[0] *= faceDirection;
      tbn2[1] *= faceDirection;

    #endif

  #endif

  // non perturbed normal for clearcoat among others

  vec3 nonPerturbedNormal = normal;

  #ifdef OUTLINE
    normal *= -1.0;
  #endif

  // #include <normal_fragment_maps>

  // COMPAT: pre-r151
  // USE_NORMALMAP_OBJECTSPACE used to be OBJECTSPACE_NORMALMAP in pre-r151
  #if defined( USE_NORMALMAP_OBJECTSPACE ) || defined( OBJECTSPACE_NORMALMAP )

    normal = texture2D( normalMap, normalMapUv ).xyz * 2.0 - 1.0; // overrides both flatShading and attribute normals

    #ifdef FLIP_SIDED

      normal = - normal;

    #endif

    #ifdef DOUBLE_SIDED

      normal = normal * faceDirection;

    #endif

    normal = normalize( normalMatrix * normal );

  // COMPAT: pre-r151
  // USE_NORMALMAP_TANGENTSPACE used to be TANGENTSPACE_NORMALMAP in pre-r151
  #elif defined( USE_NORMALMAP_TANGENTSPACE ) || defined( TANGENTSPACE_NORMALMAP )

    vec3 mapN = texture2D( normalMap, normalMapUv ).xyz * 2.0 - 1.0;
    mapN.xy *= normalScale;

    // COMPAT: pre-r151
    #if THREE_VRM_THREE_REVISION >= 151 || defined( USE_TANGENT )

      normal = normalize( tbn * mapN );

    #else

      normal = perturbNormal2Arb( uv, -vViewPosition, normal, mapN, faceDirection );

    #endif

  #endif

  // #include <emissivemap_fragment>
  #ifdef USE_EMISSIVEMAP
    vec2 emissiveMapUv = ( emissiveMapUvTransform * vec3( uv, 1 ) ).xy;
    totalEmissiveRadiance *= texture2D( emissiveMap, emissiveMapUv ).rgb;
  #endif

  #ifdef DEBUG_NORMAL
    gl_FragColor = vec4( 0.5 + 0.5 * normal, 1.0 );
    return;
  #endif

  // -- MToon: lighting --------------------------------------------------------
  // accumulation
  // #include <lights_phong_fragment>
  MToonMaterial material;

  material.diffuseColor = diffuseColor.rgb;

  material.shadeColor = shadeColorFactor;
  #ifdef USE_SHADEMULTIPLYTEXTURE
    vec2 shadeMultiplyTextureUv = ( shadeMultiplyTextureUvTransform * vec3( uv, 1 ) ).xy;
    material.shadeColor *= texture2D( shadeMultiplyTexture, shadeMultiplyTextureUv ).rgb;
  #endif

  #if ( defined( USE_COLOR ) && !defined( IGNORE_VERTEX_COLOR ) )
    material.shadeColor.rgb *= vColor;
  #endif

  material.shadingShift = shadingShiftFactor;
  #ifdef USE_SHADINGSHIFTTEXTURE
    vec2 shadingShiftTextureUv = ( shadingShiftTextureUvTransform * vec3( uv, 1 ) ).xy;
    material.shadingShift += texture2D( shadingShiftTexture, shadingShiftTextureUv ).r * shadingShiftTextureScale;
  #endif

  // #include <lights_fragment_begin>

  // MToon Specific changes:
  // Since we want to take shadows into account of shading instead of irradiance,
  // we had to modify the codes that multiplies the results of shadowmap into color of direct lights.

  // COMPAT: pre-r156 uses a struct GeometricContext
  #if THREE_VRM_THREE_REVISION >= 157
    vec3 geometryPosition = - vViewPosition;
    vec3 geometryNormal = normal;
    vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );

    vec3 geometryClearcoatNormal;

    #ifdef USE_CLEARCOAT

      geometryClearcoatNormal = clearcoatNormal;

    #endif
  #else
    GeometricContext geometry;

    geometry.position = - vViewPosition;
    geometry.normal = normal;
    geometry.viewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );

    #ifdef USE_CLEARCOAT

      geometry.clearcoatNormal = clearcoatNormal;

    #endif
  #endif

  IncidentLight directLight;

  // since these variables will be used in unrolled loop, we have to define in prior
  float shadow;

  #if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )

    PointLight pointLight;
    #if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
    PointLightShadow pointLightShadow;
    #endif

    #pragma unroll_loop_start
    for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {

      pointLight = pointLights[ i ];

      // COMPAT: pre-r156 uses a struct GeometricContext
      #if THREE_VRM_THREE_REVISION >= 157
        getPointLightInfo( pointLight, geometryPosition, directLight );
      #else
        getPointLightInfo( pointLight, geometry, directLight );
      #endif

      shadow = 1.0;
      #if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
      pointLightShadow = pointLightShadows[ i ];
      // COMPAT: pre-r166
      // r166 introduced shadowIntensity
      #if THREE_VRM_THREE_REVISION >= 166
        shadow = all( bvec2( directLight.visible, receiveShadow ) ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
      #else
        shadow = all( bvec2( directLight.visible, receiveShadow ) ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
      #endif
      #endif

      // COMPAT: pre-r156 uses a struct GeometricContext
      #if THREE_VRM_THREE_REVISION >= 157
        RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, shadow, reflectedLight );
      #else
        RE_Direct( directLight, geometry, material, shadow, reflectedLight );
      #endif

    }
    #pragma unroll_loop_end

  #endif

  #if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )

    SpotLight spotLight;
    #if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
    SpotLightShadow spotLightShadow;
    #endif

    #pragma unroll_loop_start
    for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {

      spotLight = spotLights[ i ];

      // COMPAT: pre-r156 uses a struct GeometricContext
      #if THREE_VRM_THREE_REVISION >= 157
        getSpotLightInfo( spotLight, geometryPosition, directLight );
      #else
        getSpotLightInfo( spotLight, geometry, directLight );
      #endif

      shadow = 1.0;
      #if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
      spotLightShadow = spotLightShadows[ i ];
      // COMPAT: pre-r166
      // r166 introduced shadowIntensity
      #if THREE_VRM_THREE_REVISION >= 166
        shadow = all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotShadowCoord[ i ] ) : 1.0;
      #else
        shadow = all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotShadowCoord[ i ] ) : 1.0;
      #endif
      #endif

      // COMPAT: pre-r156 uses a struct GeometricContext
      #if THREE_VRM_THREE_REVISION >= 157
        RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, shadow, reflectedLight );
      #else
        RE_Direct( directLight, geometry, material, shadow, reflectedLight );
      #endif

    }
    #pragma unroll_loop_end

  #endif

  #if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )

    DirectionalLight directionalLight;
    #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow directionalLightShadow;
    #endif

    #pragma unroll_loop_start
    for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

      directionalLight = directionalLights[ i ];

      // COMPAT: pre-r156 uses a struct GeometricContext
      #if THREE_VRM_THREE_REVISION >= 157
        getDirectionalLightInfo( directionalLight, directLight );
      #else
        getDirectionalLightInfo( directionalLight, geometry, directLight );
      #endif

      shadow = 1.0;
      #if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
      directionalLightShadow = directionalLightShadows[ i ];
      // COMPAT: pre-r166
      // r166 introduced shadowIntensity
      #if THREE_VRM_THREE_REVISION >= 166
        shadow = all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
      #else
        shadow = all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
      #endif
      #endif

      // COMPAT: pre-r156 uses a struct GeometricContext
      #if THREE_VRM_THREE_REVISION >= 157
        RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, shadow, reflectedLight );
      #else
        RE_Direct( directLight, geometry, material, shadow, reflectedLight );
      #endif

    }
    #pragma unroll_loop_end

  #endif

  // #if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )

  //   RectAreaLight rectAreaLight;

  //   #pragma unroll_loop_start
  //   for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {

  //     rectAreaLight = rectAreaLights[ i ];
  //     RE_Direct_RectArea( rectAreaLight, geometry, material, reflectedLight );

  //   }
  //   #pragma unroll_loop_end

  // #endif

  #if defined( RE_IndirectDiffuse )

    vec3 iblIrradiance = vec3( 0.0 );

    vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );

    // COMPAT: pre-r156 uses a struct GeometricContext
    // COMPAT: pre-r156 doesn't have a define USE_LIGHT_PROBES
    #if THREE_VRM_THREE_REVISION >= 157
      #if defined( USE_LIGHT_PROBES )
        irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
      #endif
    #else
      irradiance += getLightProbeIrradiance( lightProbe, geometry.normal );
    #endif

    #if ( NUM_HEMI_LIGHTS > 0 )

      #pragma unroll_loop_start
      for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {

        // COMPAT: pre-r156 uses a struct GeometricContext
        #if THREE_VRM_THREE_REVISION >= 157
          irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
        #else
          irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometry.normal );
        #endif

      }
      #pragma unroll_loop_end

    #endif

  #endif

  // #if defined( RE_IndirectSpecular )

  //   vec3 radiance = vec3( 0.0 );
  //   vec3 clearcoatRadiance = vec3( 0.0 );

  // #endif

  #include <lights_fragment_maps>
  #include <lights_fragment_end>

  // modulation
  #include <aomap_fragment>

  vec3 col = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;

  #ifdef DEBUG_LITSHADERATE
    gl_FragColor = vec4( col, diffuseColor.a );
    postCorrection();
    return;
  #endif

  // -- MToon: rim lighting -----------------------------------------
  vec3 viewDir = normalize( vViewPosition );

  #ifndef PHYSICALLY_CORRECT_LIGHTS
    reflectedLight.directSpecular /= PI;
  #endif
  vec3 rimMix = mix( vec3( 1.0 ), reflectedLight.directSpecular, 1.0 );

  vec3 rim = parametricRimColorFactor * pow( saturate( 1.0 - dot( viewDir, normal ) + parametricRimLiftFactor ), parametricRimFresnelPowerFactor );

  #ifdef USE_MATCAPTEXTURE
    {
      vec3 x = normalize( vec3( viewDir.z, 0.0, -viewDir.x ) );
      vec3 y = cross( viewDir, x ); // guaranteed to be normalized
      vec2 sphereUv = 0.5 + 0.5 * vec2( dot( x, normal ), -dot( y, normal ) );
      sphereUv = ( matcapTextureUvTransform * vec3( sphereUv, 1 ) ).xy;
      vec3 matcap = texture2D( matcapTexture, sphereUv ).rgb;
      rim += matcapFactor * matcap;
    }
  #endif

  #ifdef USE_RIMMULTIPLYTEXTURE
    vec2 rimMultiplyTextureUv = ( rimMultiplyTextureUvTransform * vec3( uv, 1 ) ).xy;
    rim *= texture2D( rimMultiplyTexture, rimMultiplyTextureUv ).rgb;
  #endif

  col += rimMix * rim;

  // -- MToon: Emission --------------------------------------------------------
  col += totalEmissiveRadiance;

  // #include <envmap_fragment>

  // -- Almost done! -----------------------------------------------------------
  #if defined( OUTLINE )
    col = outlineColorFactor.rgb * mix( vec3( 1.0 ), col, outlineLightingMixFactor );
  #endif

  #ifdef OPAQUE
    diffuseColor.a = 1.0;
  #endif

  gl_FragColor = vec4( col, diffuseColor.a );
  postCorrection();
}
`;

// packages/three-vrm-materials-mtoon/src/MToonMaterialDebugMode.ts
var MToonMaterialDebugMode = {
  None: "none",
  Normal: "normal",
  LitShadeRate: "litShadeRate",
  UV: "uv"
};

// packages/three-vrm-materials-mtoon/src/MToonMaterialOutlineWidthMode.ts
var MToonMaterialOutlineWidthMode = {
  None: "none",
  WorldCoordinates: "worldCoordinates",
  ScreenCoordinates: "screenCoordinates"
};

// packages/three-vrm-materials-mtoon/src/utils/getTextureColorSpace.ts
import * as THREE19 from "three";
var encodingColorSpaceMap = {
  3000: "",
  3001: "srgb"
};
function getTextureColorSpace(texture) {
  if (parseInt(THREE19.REVISION, 10) >= 152) {
    return texture.colorSpace;
  } else {
    return encodingColorSpaceMap[texture.encoding];
  }
}

// packages/three-vrm-materials-mtoon/src/MToonMaterial.ts
class MToonMaterial extends THREE20.ShaderMaterial {
  uniforms;
  get color() {
    return this.uniforms.litFactor.value;
  }
  set color(value) {
    this.uniforms.litFactor.value = value;
  }
  get map() {
    return this.uniforms.map.value;
  }
  set map(value) {
    this.uniforms.map.value = value;
  }
  get normalMap() {
    return this.uniforms.normalMap.value;
  }
  set normalMap(value) {
    this.uniforms.normalMap.value = value;
  }
  get normalScale() {
    return this.uniforms.normalScale.value;
  }
  set normalScale(value) {
    this.uniforms.normalScale.value = value;
  }
  get emissive() {
    return this.uniforms.emissive.value;
  }
  set emissive(value) {
    this.uniforms.emissive.value = value;
  }
  get emissiveIntensity() {
    return this.uniforms.emissiveIntensity.value;
  }
  set emissiveIntensity(value) {
    this.uniforms.emissiveIntensity.value = value;
  }
  get emissiveMap() {
    return this.uniforms.emissiveMap.value;
  }
  set emissiveMap(value) {
    this.uniforms.emissiveMap.value = value;
  }
  get shadeColorFactor() {
    return this.uniforms.shadeColorFactor.value;
  }
  set shadeColorFactor(value) {
    this.uniforms.shadeColorFactor.value = value;
  }
  get shadeMultiplyTexture() {
    return this.uniforms.shadeMultiplyTexture.value;
  }
  set shadeMultiplyTexture(value) {
    this.uniforms.shadeMultiplyTexture.value = value;
  }
  get shadingShiftFactor() {
    return this.uniforms.shadingShiftFactor.value;
  }
  set shadingShiftFactor(value) {
    this.uniforms.shadingShiftFactor.value = value;
  }
  get shadingShiftTexture() {
    return this.uniforms.shadingShiftTexture.value;
  }
  set shadingShiftTexture(value) {
    this.uniforms.shadingShiftTexture.value = value;
  }
  get shadingShiftTextureScale() {
    return this.uniforms.shadingShiftTextureScale.value;
  }
  set shadingShiftTextureScale(value) {
    this.uniforms.shadingShiftTextureScale.value = value;
  }
  get shadingToonyFactor() {
    return this.uniforms.shadingToonyFactor.value;
  }
  set shadingToonyFactor(value) {
    this.uniforms.shadingToonyFactor.value = value;
  }
  get giEqualizationFactor() {
    return this.uniforms.giEqualizationFactor.value;
  }
  set giEqualizationFactor(value) {
    this.uniforms.giEqualizationFactor.value = value;
  }
  get matcapFactor() {
    return this.uniforms.matcapFactor.value;
  }
  set matcapFactor(value) {
    this.uniforms.matcapFactor.value = value;
  }
  get matcapTexture() {
    return this.uniforms.matcapTexture.value;
  }
  set matcapTexture(value) {
    this.uniforms.matcapTexture.value = value;
  }
  get parametricRimColorFactor() {
    return this.uniforms.parametricRimColorFactor.value;
  }
  set parametricRimColorFactor(value) {
    this.uniforms.parametricRimColorFactor.value = value;
  }
  get rimMultiplyTexture() {
    return this.uniforms.rimMultiplyTexture.value;
  }
  set rimMultiplyTexture(value) {
    this.uniforms.rimMultiplyTexture.value = value;
  }
  get rimLightingMixFactor() {
    return this.uniforms.rimLightingMixFactor.value;
  }
  set rimLightingMixFactor(value) {
    this.uniforms.rimLightingMixFactor.value = value;
  }
  get parametricRimFresnelPowerFactor() {
    return this.uniforms.parametricRimFresnelPowerFactor.value;
  }
  set parametricRimFresnelPowerFactor(value) {
    this.uniforms.parametricRimFresnelPowerFactor.value = value;
  }
  get parametricRimLiftFactor() {
    return this.uniforms.parametricRimLiftFactor.value;
  }
  set parametricRimLiftFactor(value) {
    this.uniforms.parametricRimLiftFactor.value = value;
  }
  get outlineWidthMultiplyTexture() {
    return this.uniforms.outlineWidthMultiplyTexture.value;
  }
  set outlineWidthMultiplyTexture(value) {
    this.uniforms.outlineWidthMultiplyTexture.value = value;
  }
  get outlineWidthFactor() {
    return this.uniforms.outlineWidthFactor.value;
  }
  set outlineWidthFactor(value) {
    this.uniforms.outlineWidthFactor.value = value;
  }
  get outlineColorFactor() {
    return this.uniforms.outlineColorFactor.value;
  }
  set outlineColorFactor(value) {
    this.uniforms.outlineColorFactor.value = value;
  }
  get outlineLightingMixFactor() {
    return this.uniforms.outlineLightingMixFactor.value;
  }
  set outlineLightingMixFactor(value) {
    this.uniforms.outlineLightingMixFactor.value = value;
  }
  get uvAnimationMaskTexture() {
    return this.uniforms.uvAnimationMaskTexture.value;
  }
  set uvAnimationMaskTexture(value) {
    this.uniforms.uvAnimationMaskTexture.value = value;
  }
  get uvAnimationScrollXOffset() {
    return this.uniforms.uvAnimationScrollXOffset.value;
  }
  set uvAnimationScrollXOffset(value) {
    this.uniforms.uvAnimationScrollXOffset.value = value;
  }
  get uvAnimationScrollYOffset() {
    return this.uniforms.uvAnimationScrollYOffset.value;
  }
  set uvAnimationScrollYOffset(value) {
    this.uniforms.uvAnimationScrollYOffset.value = value;
  }
  get uvAnimationRotationPhase() {
    return this.uniforms.uvAnimationRotationPhase.value;
  }
  set uvAnimationRotationPhase(value) {
    this.uniforms.uvAnimationRotationPhase.value = value;
  }
  uvAnimationScrollXSpeedFactor = 0;
  uvAnimationScrollYSpeedFactor = 0;
  uvAnimationRotationSpeedFactor = 0;
  fog = true;
  normalMapType = THREE20.TangentSpaceNormalMap;
  _ignoreVertexColor = true;
  get ignoreVertexColor() {
    return this._ignoreVertexColor;
  }
  set ignoreVertexColor(value) {
    this._ignoreVertexColor = value;
    this.needsUpdate = true;
  }
  _v0CompatShade = false;
  get v0CompatShade() {
    return this._v0CompatShade;
  }
  set v0CompatShade(v) {
    this._v0CompatShade = v;
    this.needsUpdate = true;
  }
  _debugMode = MToonMaterialDebugMode.None;
  get debugMode() {
    return this._debugMode;
  }
  set debugMode(m) {
    this._debugMode = m;
    this.needsUpdate = true;
  }
  _outlineWidthMode = MToonMaterialOutlineWidthMode.None;
  get outlineWidthMode() {
    return this._outlineWidthMode;
  }
  set outlineWidthMode(m) {
    this._outlineWidthMode = m;
    this.needsUpdate = true;
  }
  _isOutline = false;
  get isOutline() {
    return this._isOutline;
  }
  set isOutline(b) {
    this._isOutline = b;
    this.needsUpdate = true;
  }
  get isMToonMaterial() {
    return true;
  }
  constructor(parameters = {}) {
    super({ vertexShader: mtoon_default, fragmentShader: mtoon_default2 });
    if (parameters.transparentWithZWrite) {
      parameters.depthWrite = true;
    }
    delete parameters.transparentWithZWrite;
    parameters.fog = true;
    parameters.lights = true;
    parameters.clipping = true;
    this.uniforms = THREE20.UniformsUtils.merge([
      THREE20.UniformsLib.common,
      THREE20.UniformsLib.normalmap,
      THREE20.UniformsLib.emissivemap,
      THREE20.UniformsLib.fog,
      THREE20.UniformsLib.lights,
      {
        litFactor: { value: new THREE20.Color(1, 1, 1) },
        mapUvTransform: { value: new THREE20.Matrix3 },
        colorAlpha: { value: 1 },
        normalMapUvTransform: { value: new THREE20.Matrix3 },
        shadeColorFactor: { value: new THREE20.Color(0, 0, 0) },
        shadeMultiplyTexture: { value: null },
        shadeMultiplyTextureUvTransform: { value: new THREE20.Matrix3 },
        shadingShiftFactor: { value: 0 },
        shadingShiftTexture: { value: null },
        shadingShiftTextureUvTransform: { value: new THREE20.Matrix3 },
        shadingShiftTextureScale: { value: 1 },
        shadingToonyFactor: { value: 0.9 },
        giEqualizationFactor: { value: 0.9 },
        matcapFactor: { value: new THREE20.Color(1, 1, 1) },
        matcapTexture: { value: null },
        matcapTextureUvTransform: { value: new THREE20.Matrix3 },
        parametricRimColorFactor: { value: new THREE20.Color(0, 0, 0) },
        rimMultiplyTexture: { value: null },
        rimMultiplyTextureUvTransform: { value: new THREE20.Matrix3 },
        rimLightingMixFactor: { value: 1 },
        parametricRimFresnelPowerFactor: { value: 5 },
        parametricRimLiftFactor: { value: 0 },
        emissive: { value: new THREE20.Color(0, 0, 0) },
        emissiveIntensity: { value: 1 },
        emissiveMapUvTransform: { value: new THREE20.Matrix3 },
        outlineWidthMultiplyTexture: { value: null },
        outlineWidthMultiplyTextureUvTransform: { value: new THREE20.Matrix3 },
        outlineWidthFactor: { value: 0 },
        outlineColorFactor: { value: new THREE20.Color(0, 0, 0) },
        outlineLightingMixFactor: { value: 1 },
        uvAnimationMaskTexture: { value: null },
        uvAnimationMaskTextureUvTransform: { value: new THREE20.Matrix3 },
        uvAnimationScrollXOffset: { value: 0 },
        uvAnimationScrollYOffset: { value: 0 },
        uvAnimationRotationPhase: { value: 0 }
      },
      parameters.uniforms ?? {}
    ]);
    this.setValues(parameters);
    this._uploadUniformsWorkaround();
    this.customProgramCacheKey = () => [
      ...Object.entries(this._generateDefines()).map(([token, macro]) => `${token}:${macro}`),
      this.matcapTexture ? `matcapTextureColorSpace:${getTextureColorSpace(this.matcapTexture)}` : "",
      this.shadeMultiplyTexture ? `shadeMultiplyTextureColorSpace:${getTextureColorSpace(this.shadeMultiplyTexture)}` : "",
      this.rimMultiplyTexture ? `rimMultiplyTextureColorSpace:${getTextureColorSpace(this.rimMultiplyTexture)}` : ""
    ].join(",");
    this.onBeforeCompile = (shader) => {
      const threeRevision = parseInt(THREE20.REVISION, 10);
      const defines = Object.entries({ ...this._generateDefines(), ...this.defines }).filter(([token, macro]) => !!macro).map(([token, macro]) => `#define ${token} ${macro}`).join(`
`) + `
`;
      shader.vertexShader = defines + shader.vertexShader;
      shader.fragmentShader = defines + shader.fragmentShader;
      if (threeRevision < 154) {
        shader.fragmentShader = shader.fragmentShader.replace("#include <colorspace_fragment>", "#include <encodings_fragment>");
      }
    };
  }
  update(delta) {
    this._uploadUniformsWorkaround();
    this._updateUVAnimation(delta);
  }
  copy(source) {
    super.copy(source);
    this.map = source.map;
    this.normalMap = source.normalMap;
    this.emissiveMap = source.emissiveMap;
    this.shadeMultiplyTexture = source.shadeMultiplyTexture;
    this.shadingShiftTexture = source.shadingShiftTexture;
    this.matcapTexture = source.matcapTexture;
    this.rimMultiplyTexture = source.rimMultiplyTexture;
    this.outlineWidthMultiplyTexture = source.outlineWidthMultiplyTexture;
    this.uvAnimationMaskTexture = source.uvAnimationMaskTexture;
    this.normalMapType = source.normalMapType;
    this.uvAnimationScrollXSpeedFactor = source.uvAnimationScrollXSpeedFactor;
    this.uvAnimationScrollYSpeedFactor = source.uvAnimationScrollYSpeedFactor;
    this.uvAnimationRotationSpeedFactor = source.uvAnimationRotationSpeedFactor;
    this.ignoreVertexColor = source.ignoreVertexColor;
    this.v0CompatShade = source.v0CompatShade;
    this.debugMode = source.debugMode;
    this.outlineWidthMode = source.outlineWidthMode;
    this.isOutline = source.isOutline;
    this.needsUpdate = true;
    return this;
  }
  _updateUVAnimation(delta) {
    this.uniforms.uvAnimationScrollXOffset.value += delta * this.uvAnimationScrollXSpeedFactor;
    this.uniforms.uvAnimationScrollYOffset.value += delta * this.uvAnimationScrollYSpeedFactor;
    this.uniforms.uvAnimationRotationPhase.value += delta * this.uvAnimationRotationSpeedFactor;
    this.uniforms.alphaTest.value = this.alphaTest;
    this.uniformsNeedUpdate = true;
  }
  _uploadUniformsWorkaround() {
    this.uniforms.opacity.value = this.opacity;
    this._updateTextureMatrix(this.uniforms.map, this.uniforms.mapUvTransform);
    this._updateTextureMatrix(this.uniforms.normalMap, this.uniforms.normalMapUvTransform);
    this._updateTextureMatrix(this.uniforms.emissiveMap, this.uniforms.emissiveMapUvTransform);
    this._updateTextureMatrix(this.uniforms.shadeMultiplyTexture, this.uniforms.shadeMultiplyTextureUvTransform);
    this._updateTextureMatrix(this.uniforms.shadingShiftTexture, this.uniforms.shadingShiftTextureUvTransform);
    this._updateTextureMatrix(this.uniforms.matcapTexture, this.uniforms.matcapTextureUvTransform);
    this._updateTextureMatrix(this.uniforms.rimMultiplyTexture, this.uniforms.rimMultiplyTextureUvTransform);
    this._updateTextureMatrix(this.uniforms.outlineWidthMultiplyTexture, this.uniforms.outlineWidthMultiplyTextureUvTransform);
    this._updateTextureMatrix(this.uniforms.uvAnimationMaskTexture, this.uniforms.uvAnimationMaskTextureUvTransform);
    this.uniformsNeedUpdate = true;
  }
  _generateDefines() {
    const threeRevision = parseInt(THREE20.REVISION, 10);
    const useUvInVert = this.outlineWidthMultiplyTexture !== null;
    const useUvInFrag = this.map !== null || this.normalMap !== null || this.emissiveMap !== null || this.shadeMultiplyTexture !== null || this.shadingShiftTexture !== null || this.rimMultiplyTexture !== null || this.uvAnimationMaskTexture !== null;
    return {
      THREE_VRM_THREE_REVISION: threeRevision,
      OUTLINE: this._isOutline,
      MTOON_USE_UV: useUvInVert || useUvInFrag,
      MTOON_UVS_VERTEX_ONLY: useUvInVert && !useUvInFrag,
      V0_COMPAT_SHADE: this._v0CompatShade,
      USE_SHADEMULTIPLYTEXTURE: this.shadeMultiplyTexture !== null,
      USE_SHADINGSHIFTTEXTURE: this.shadingShiftTexture !== null,
      USE_MATCAPTEXTURE: this.matcapTexture !== null,
      USE_RIMMULTIPLYTEXTURE: this.rimMultiplyTexture !== null,
      USE_OUTLINEWIDTHMULTIPLYTEXTURE: this._isOutline && this.outlineWidthMultiplyTexture !== null,
      USE_UVANIMATIONMASKTEXTURE: this.uvAnimationMaskTexture !== null,
      IGNORE_VERTEX_COLOR: this._ignoreVertexColor === true,
      DEBUG_NORMAL: this._debugMode === "normal",
      DEBUG_LITSHADERATE: this._debugMode === "litShadeRate",
      DEBUG_UV: this._debugMode === "uv",
      OUTLINE_WIDTH_WORLD: this._isOutline && this._outlineWidthMode === MToonMaterialOutlineWidthMode.WorldCoordinates,
      OUTLINE_WIDTH_SCREEN: this._isOutline && this._outlineWidthMode === MToonMaterialOutlineWidthMode.ScreenCoordinates
    };
  }
  _updateTextureMatrix(src, dst) {
    if (src.value) {
      if (src.value.matrixAutoUpdate) {
        src.value.updateMatrix();
      }
      dst.value.copy(src.value.matrix);
    }
  }
}

// packages/three-vrm-materials-mtoon/src/MToonMaterialLoaderPlugin.ts
var POSSIBLE_SPEC_VERSIONS6 = new Set(["1.0", "1.0-beta"]);

class MToonMaterialLoaderPlugin {
  static EXTENSION_NAME = "VRMC_materials_mtoon";
  materialType;
  renderOrderOffset;
  v0CompatShade;
  debugMode;
  parser;
  _mToonMaterialSet;
  get name() {
    return MToonMaterialLoaderPlugin.EXTENSION_NAME;
  }
  constructor(parser, options = {}) {
    this.parser = parser;
    this.materialType = options.materialType ?? MToonMaterial;
    this.renderOrderOffset = options.renderOrderOffset ?? 0;
    this.v0CompatShade = options.v0CompatShade ?? false;
    this.debugMode = options.debugMode ?? "none";
    this._mToonMaterialSet = new Set;
  }
  async beforeRoot() {
    this._removeUnlitExtensionIfMToonExists();
  }
  async afterRoot(gltf) {
    gltf.userData.vrmMToonMaterials = Array.from(this._mToonMaterialSet);
  }
  getMaterialType(materialIndex) {
    const v1Extension = this._getMToonExtension(materialIndex);
    if (v1Extension) {
      return this.materialType;
    }
    return null;
  }
  extendMaterialParams(materialIndex, materialParams) {
    const extension = this._getMToonExtension(materialIndex);
    if (extension) {
      return this._extendMaterialParams(extension, materialParams);
    }
    return null;
  }
  async loadMesh(meshIndex) {
    const parser = this.parser;
    const json = parser.json;
    const meshDef = json.meshes?.[meshIndex];
    if (meshDef == null) {
      throw new Error(`MToonMaterialLoaderPlugin: Attempt to use meshes[${meshIndex}] of glTF but the mesh doesn't exist`);
    }
    const primitivesDef = meshDef.primitives;
    const meshOrGroup = await parser.loadMesh(meshIndex);
    if (primitivesDef.length === 1) {
      const mesh = meshOrGroup;
      const materialIndex = primitivesDef[0].material;
      if (materialIndex != null) {
        this._setupPrimitive(mesh, materialIndex);
      }
    } else {
      const group = meshOrGroup;
      for (let i = 0;i < primitivesDef.length; i++) {
        const mesh = group.children[i];
        const materialIndex = primitivesDef[i].material;
        if (materialIndex != null) {
          this._setupPrimitive(mesh, materialIndex);
        }
      }
    }
    return meshOrGroup;
  }
  _removeUnlitExtensionIfMToonExists() {
    const parser = this.parser;
    const json = parser.json;
    const materialDefs = json.materials;
    materialDefs?.map((materialDef, iMaterial) => {
      const extension = this._getMToonExtension(iMaterial);
      if (extension && materialDef.extensions?.["KHR_materials_unlit"]) {
        delete materialDef.extensions["KHR_materials_unlit"];
      }
    });
  }
  _getMToonExtension(materialIndex) {
    const parser = this.parser;
    const json = parser.json;
    const materialDef = json.materials?.[materialIndex];
    if (materialDef == null) {
      console.warn(`MToonMaterialLoaderPlugin: Attempt to use materials[${materialIndex}] of glTF but the material doesn't exist`);
      return;
    }
    const extension = materialDef.extensions?.[MToonMaterialLoaderPlugin.EXTENSION_NAME];
    if (extension == null) {
      return;
    }
    const specVersion = extension.specVersion;
    if (!POSSIBLE_SPEC_VERSIONS6.has(specVersion)) {
      console.warn(`MToonMaterialLoaderPlugin: Unknown ${MToonMaterialLoaderPlugin.EXTENSION_NAME} specVersion "${specVersion}"`);
      return;
    }
    return extension;
  }
  async _extendMaterialParams(extension, materialParams) {
    delete materialParams.metalness;
    delete materialParams.roughness;
    const assignHelper = new GLTFMToonMaterialParamsAssignHelper(this.parser, materialParams);
    assignHelper.assignPrimitive("transparentWithZWrite", extension.transparentWithZWrite);
    assignHelper.assignColor("shadeColorFactor", extension.shadeColorFactor);
    assignHelper.assignTexture("shadeMultiplyTexture", extension.shadeMultiplyTexture, true);
    assignHelper.assignPrimitive("shadingShiftFactor", extension.shadingShiftFactor);
    assignHelper.assignTexture("shadingShiftTexture", extension.shadingShiftTexture, true);
    assignHelper.assignPrimitive("shadingShiftTextureScale", extension.shadingShiftTexture?.scale);
    assignHelper.assignPrimitive("shadingToonyFactor", extension.shadingToonyFactor);
    assignHelper.assignPrimitive("giEqualizationFactor", extension.giEqualizationFactor);
    assignHelper.assignColor("matcapFactor", extension.matcapFactor);
    assignHelper.assignTexture("matcapTexture", extension.matcapTexture, true);
    assignHelper.assignColor("parametricRimColorFactor", extension.parametricRimColorFactor);
    assignHelper.assignTexture("rimMultiplyTexture", extension.rimMultiplyTexture, true);
    assignHelper.assignPrimitive("rimLightingMixFactor", extension.rimLightingMixFactor);
    assignHelper.assignPrimitive("parametricRimFresnelPowerFactor", extension.parametricRimFresnelPowerFactor);
    assignHelper.assignPrimitive("parametricRimLiftFactor", extension.parametricRimLiftFactor);
    assignHelper.assignPrimitive("outlineWidthMode", extension.outlineWidthMode);
    assignHelper.assignPrimitive("outlineWidthFactor", extension.outlineWidthFactor);
    assignHelper.assignTexture("outlineWidthMultiplyTexture", extension.outlineWidthMultiplyTexture, false);
    assignHelper.assignColor("outlineColorFactor", extension.outlineColorFactor);
    assignHelper.assignPrimitive("outlineLightingMixFactor", extension.outlineLightingMixFactor);
    assignHelper.assignTexture("uvAnimationMaskTexture", extension.uvAnimationMaskTexture, false);
    assignHelper.assignPrimitive("uvAnimationScrollXSpeedFactor", extension.uvAnimationScrollXSpeedFactor);
    assignHelper.assignPrimitive("uvAnimationScrollYSpeedFactor", extension.uvAnimationScrollYSpeedFactor);
    assignHelper.assignPrimitive("uvAnimationRotationSpeedFactor", extension.uvAnimationRotationSpeedFactor);
    assignHelper.assignPrimitive("v0CompatShade", this.v0CompatShade);
    assignHelper.assignPrimitive("debugMode", this.debugMode);
    await assignHelper.pending;
  }
  _setupPrimitive(mesh, materialIndex) {
    const extension = this._getMToonExtension(materialIndex);
    if (extension) {
      const renderOrder = this._parseRenderOrder(extension);
      mesh.renderOrder = renderOrder + this.renderOrderOffset;
      this._generateOutline(mesh);
      this._addToMaterialSet(mesh);
      return;
    }
  }
  _shouldGenerateOutline(surfaceMaterial) {
    return typeof surfaceMaterial.outlineWidthMode === "string" && surfaceMaterial.outlineWidthMode !== "none" && typeof surfaceMaterial.outlineWidthFactor === "number" && surfaceMaterial.outlineWidthFactor > 0;
  }
  _generateOutline(mesh) {
    const surfaceMaterial = mesh.material;
    if (!(surfaceMaterial instanceof THREE21.Material)) {
      return;
    }
    if (!this._shouldGenerateOutline(surfaceMaterial)) {
      return;
    }
    mesh.material = [surfaceMaterial];
    const outlineMaterial = surfaceMaterial.clone();
    outlineMaterial.name += " (Outline)";
    outlineMaterial.isOutline = true;
    outlineMaterial.side = THREE21.BackSide;
    mesh.material.push(outlineMaterial);
    const geometry = mesh.geometry;
    const primitiveVertices = geometry.index ? geometry.index.count : geometry.attributes.position.count / 3;
    geometry.addGroup(0, primitiveVertices, 0);
    geometry.addGroup(0, primitiveVertices, 1);
  }
  _addToMaterialSet(mesh) {
    const materialOrMaterials = mesh.material;
    const materialSet = new Set;
    if (Array.isArray(materialOrMaterials)) {
      materialOrMaterials.forEach((material) => materialSet.add(material));
    } else {
      materialSet.add(materialOrMaterials);
    }
    for (const material of materialSet) {
      this._mToonMaterialSet.add(material);
    }
  }
  _parseRenderOrder(extension) {
    const enabledZWrite = extension.transparentWithZWrite;
    return (enabledZWrite ? 0 : 19) + (extension.renderQueueOffsetNumber ?? 0);
  }
}
// packages/three-vrm-materials-hdr-emissive-multiplier/src/VRMMaterialsHDREmissiveMultiplierLoaderPlugin.ts
class VRMMaterialsHDREmissiveMultiplierLoaderPlugin {
  static EXTENSION_NAME = "VRMC_materials_hdr_emissiveMultiplier";
  parser;
  get name() {
    return VRMMaterialsHDREmissiveMultiplierLoaderPlugin.EXTENSION_NAME;
  }
  constructor(parser) {
    this.parser = parser;
  }
  async extendMaterialParams(materialIndex, materialParams) {
    const extension = this._getHDREmissiveMultiplierExtension(materialIndex);
    if (extension == null) {
      return;
    }
    console.warn("VRMMaterialsHDREmissiveMultiplierLoaderPlugin: `VRMC_materials_hdr_emissiveMultiplier` is archived. Use `KHR_materials_emissive_strength` instead.");
    const emissiveMultiplier = extension.emissiveMultiplier;
    materialParams.emissiveIntensity = emissiveMultiplier;
  }
  _getHDREmissiveMultiplierExtension(materialIndex) {
    const parser = this.parser;
    const json = parser.json;
    const materialDef = json.materials?.[materialIndex];
    if (materialDef == null) {
      console.warn(`VRMMaterialsHDREmissiveMultiplierLoaderPlugin: Attempt to use materials[${materialIndex}] of glTF but the material doesn't exist`);
      return;
    }
    const extension = materialDef.extensions?.[VRMMaterialsHDREmissiveMultiplierLoaderPlugin.EXTENSION_NAME];
    if (extension == null) {
      return;
    }
    return extension;
  }
}
// packages/three-vrm-materials-v0compat/src/VRMMaterialsV0CompatPlugin.ts
import * as THREE22 from "three";

// packages/three-vrm-materials-v0compat/src/utils/gammaEOTF.ts
function gammaEOTF(e) {
  return Math.pow(e, 2.2);
}

// packages/three-vrm-materials-v0compat/src/VRMMaterialsV0CompatPlugin.ts
class VRMMaterialsV0CompatPlugin {
  parser;
  _renderQueueMapTransparent;
  _renderQueueMapTransparentZWrite;
  get name() {
    return "VRMMaterialsV0CompatPlugin";
  }
  constructor(parser) {
    this.parser = parser;
    this._renderQueueMapTransparent = new Map;
    this._renderQueueMapTransparentZWrite = new Map;
    const json = this.parser.json;
    json.extensionsUsed = json.extensionsUsed ?? [];
    if (json.extensionsUsed.indexOf("KHR_texture_transform") === -1) {
      json.extensionsUsed.push("KHR_texture_transform");
    }
  }
  async beforeRoot() {
    const json = this.parser.json;
    const v0VRMExtension = json.extensions?.["VRM"];
    const v0MaterialProperties = v0VRMExtension?.materialProperties;
    if (!v0MaterialProperties) {
      return;
    }
    this._populateRenderQueueMap(v0MaterialProperties);
    v0MaterialProperties.forEach((materialProperties, materialIndex) => {
      const materialDef = json.materials?.[materialIndex];
      if (materialDef == null) {
        console.warn(`VRMMaterialsV0CompatPlugin: Attempt to use materials[${materialIndex}] of glTF but the material doesn't exist`);
        return;
      }
      if (materialProperties.shader === "VRM/MToon") {
        const material = this._parseV0MToonProperties(materialProperties, materialDef);
        json.materials[materialIndex] = material;
      } else if (materialProperties.shader?.startsWith("VRM/Unlit")) {
        const material = this._parseV0UnlitProperties(materialProperties, materialDef);
        json.materials[materialIndex] = material;
      } else if (materialProperties.shader === "VRM_USE_GLTFSHADER") {} else {
        console.warn(`VRMMaterialsV0CompatPlugin: Unknown shader: ${materialProperties.shader}`);
      }
    });
  }
  _parseV0MToonProperties(materialProperties, schemaMaterial) {
    const isTransparent = materialProperties.keywordMap?.["_ALPHABLEND_ON"] ?? false;
    const enabledZWrite = materialProperties.floatProperties?.["_ZWrite"] === 1;
    const transparentWithZWrite = enabledZWrite && isTransparent;
    const renderQueueOffsetNumber = this._v0ParseRenderQueue(materialProperties);
    const isCutoff = materialProperties.keywordMap?.["_ALPHATEST_ON"] ?? false;
    const alphaMode = isTransparent ? "BLEND" : isCutoff ? "MASK" : "OPAQUE";
    const alphaCutoff = isCutoff ? materialProperties.floatProperties?.["_Cutoff"] ?? 0.5 : undefined;
    const cullMode = materialProperties.floatProperties?.["_CullMode"] ?? 2;
    const doubleSided = cullMode === 0;
    const textureTransformExt = this._portTextureTransform(materialProperties);
    const baseColorFactor = (materialProperties.vectorProperties?.["_Color"] ?? [1, 1, 1, 1]).map((v, i) => i === 3 ? v : gammaEOTF(v));
    const baseColorTextureIndex = materialProperties.textureProperties?.["_MainTex"];
    const baseColorTexture = baseColorTextureIndex != null ? {
      index: baseColorTextureIndex,
      extensions: {
        ...textureTransformExt
      }
    } : undefined;
    const normalTextureScale = materialProperties.floatProperties?.["_BumpScale"] ?? 1;
    const normalTextureIndex = materialProperties.textureProperties?.["_BumpMap"];
    const normalTexture = normalTextureIndex != null ? {
      index: normalTextureIndex,
      scale: normalTextureScale,
      extensions: {
        ...textureTransformExt
      }
    } : undefined;
    const emissiveFactor = (materialProperties.vectorProperties?.["_EmissionColor"] ?? [0, 0, 0, 1]).map(gammaEOTF);
    const emissiveTextureIndex = materialProperties.textureProperties?.["_EmissionMap"];
    const emissiveTexture = emissiveTextureIndex != null ? {
      index: emissiveTextureIndex,
      extensions: {
        ...textureTransformExt
      }
    } : undefined;
    const shadeColorFactor = (materialProperties.vectorProperties?.["_ShadeColor"] ?? [0.97, 0.81, 0.86, 1]).map(gammaEOTF);
    const shadeMultiplyTextureIndex = materialProperties.textureProperties?.["_ShadeTexture"];
    const shadeMultiplyTexture = shadeMultiplyTextureIndex != null ? {
      index: shadeMultiplyTextureIndex,
      extensions: {
        ...textureTransformExt
      }
    } : undefined;
    let shadingShiftFactor = materialProperties.floatProperties?.["_ShadeShift"] ?? 0;
    let shadingToonyFactor = materialProperties.floatProperties?.["_ShadeToony"] ?? 0.9;
    shadingToonyFactor = THREE22.MathUtils.lerp(shadingToonyFactor, 1, 0.5 + 0.5 * shadingShiftFactor);
    shadingShiftFactor = -shadingShiftFactor - (1 - shadingToonyFactor);
    const giIntensityFactor = materialProperties.floatProperties?.["_IndirectLightIntensity"] ?? 0.1;
    const giEqualizationFactor = giIntensityFactor ? 1 - giIntensityFactor : undefined;
    const matcapTextureIndex = materialProperties.textureProperties?.["_SphereAdd"];
    const matcapFactor = matcapTextureIndex != null ? [1, 1, 1] : undefined;
    const matcapTexture = matcapTextureIndex != null ? {
      index: matcapTextureIndex
    } : undefined;
    const rimLightingMixFactor = materialProperties.floatProperties?.["_RimLightingMix"] ?? 0;
    const rimMultiplyTextureIndex = materialProperties.textureProperties?.["_RimTexture"];
    const rimMultiplyTexture = rimMultiplyTextureIndex != null ? {
      index: rimMultiplyTextureIndex,
      extensions: {
        ...textureTransformExt
      }
    } : undefined;
    const parametricRimColorFactor = (materialProperties.vectorProperties?.["_RimColor"] ?? [0, 0, 0, 1]).map(gammaEOTF);
    const parametricRimFresnelPowerFactor = materialProperties.floatProperties?.["_RimFresnelPower"] ?? 1;
    const parametricRimLiftFactor = materialProperties.floatProperties?.["_RimLift"] ?? 0;
    const outlineWidthMode = ["none", "worldCoordinates", "screenCoordinates"][materialProperties.floatProperties?.["_OutlineWidthMode"] ?? 0];
    let outlineWidthFactor = materialProperties.floatProperties?.["_OutlineWidth"] ?? 0;
    outlineWidthFactor = 0.01 * outlineWidthFactor;
    const outlineWidthMultiplyTextureIndex = materialProperties.textureProperties?.["_OutlineWidthTexture"];
    const outlineWidthMultiplyTexture = outlineWidthMultiplyTextureIndex != null ? {
      index: outlineWidthMultiplyTextureIndex,
      extensions: {
        ...textureTransformExt
      }
    } : undefined;
    const outlineColorFactor = (materialProperties.vectorProperties?.["_OutlineColor"] ?? [0, 0, 0]).map(gammaEOTF);
    const outlineColorMode = materialProperties.floatProperties?.["_OutlineColorMode"] ?? 0;
    const outlineLightingMixFactor = outlineColorMode === 1 ? materialProperties.floatProperties?.["_OutlineLightingMix"] ?? 1 : 0;
    const uvAnimationMaskTextureIndex = materialProperties.textureProperties?.["_UvAnimMaskTexture"];
    const uvAnimationMaskTexture = uvAnimationMaskTextureIndex != null ? {
      index: uvAnimationMaskTextureIndex,
      extensions: {
        ...textureTransformExt
      }
    } : undefined;
    const uvAnimationScrollXSpeedFactor = materialProperties.floatProperties?.["_UvAnimScrollX"] ?? 0;
    let uvAnimationScrollYSpeedFactor = materialProperties.floatProperties?.["_UvAnimScrollY"] ?? 0;
    if (uvAnimationScrollYSpeedFactor != null) {
      uvAnimationScrollYSpeedFactor = -uvAnimationScrollYSpeedFactor;
    }
    const uvAnimationRotationSpeedFactor = materialProperties.floatProperties?.["_UvAnimRotation"] ?? 0;
    const mtoonExtension = {
      specVersion: "1.0",
      transparentWithZWrite,
      renderQueueOffsetNumber,
      shadeColorFactor,
      shadeMultiplyTexture,
      shadingShiftFactor,
      shadingToonyFactor,
      giEqualizationFactor,
      matcapFactor,
      matcapTexture,
      rimLightingMixFactor,
      rimMultiplyTexture,
      parametricRimColorFactor,
      parametricRimFresnelPowerFactor,
      parametricRimLiftFactor,
      outlineWidthMode,
      outlineWidthFactor,
      outlineWidthMultiplyTexture,
      outlineColorFactor,
      outlineLightingMixFactor,
      uvAnimationMaskTexture,
      uvAnimationScrollXSpeedFactor,
      uvAnimationScrollYSpeedFactor,
      uvAnimationRotationSpeedFactor
    };
    return {
      ...schemaMaterial,
      pbrMetallicRoughness: {
        baseColorFactor,
        baseColorTexture
      },
      normalTexture,
      emissiveTexture,
      emissiveFactor,
      alphaMode,
      alphaCutoff,
      doubleSided,
      extensions: {
        VRMC_materials_mtoon: mtoonExtension
      }
    };
  }
  _parseV0UnlitProperties(materialProperties, schemaMaterial) {
    const isTransparentZWrite = materialProperties.shader === "VRM/UnlitTransparentZWrite";
    const isTransparent = materialProperties.shader === "VRM/UnlitTransparent" || isTransparentZWrite;
    const renderQueueOffsetNumber = this._v0ParseRenderQueue(materialProperties);
    const isCutoff = materialProperties.shader === "VRM/UnlitCutout";
    const alphaMode = isTransparent ? "BLEND" : isCutoff ? "MASK" : "OPAQUE";
    const alphaCutoff = isCutoff ? materialProperties.floatProperties?.["_Cutoff"] ?? 0.5 : undefined;
    const textureTransformExt = this._portTextureTransform(materialProperties);
    const baseColorFactor = (materialProperties.vectorProperties?.["_Color"] ?? [1, 1, 1, 1]).map(gammaEOTF);
    const baseColorTextureIndex = materialProperties.textureProperties?.["_MainTex"];
    const baseColorTexture = baseColorTextureIndex != null ? {
      index: baseColorTextureIndex,
      extensions: {
        ...textureTransformExt
      }
    } : undefined;
    const mtoonExtension = {
      specVersion: "1.0",
      transparentWithZWrite: isTransparentZWrite,
      renderQueueOffsetNumber,
      shadeColorFactor: baseColorFactor,
      shadeMultiplyTexture: baseColorTexture
    };
    return {
      ...schemaMaterial,
      pbrMetallicRoughness: {
        baseColorFactor,
        baseColorTexture
      },
      alphaMode,
      alphaCutoff,
      extensions: {
        VRMC_materials_mtoon: mtoonExtension
      }
    };
  }
  _portTextureTransform(materialProperties) {
    const textureTransform = materialProperties.vectorProperties?.["_MainTex"];
    if (textureTransform == null) {
      return {};
    }
    const offset = [textureTransform?.[0] ?? 0, textureTransform?.[1] ?? 0];
    const scale = [textureTransform?.[2] ?? 1, textureTransform?.[3] ?? 1];
    offset[1] = 1 - scale[1] - offset[1];
    return {
      KHR_texture_transform: { offset, scale }
    };
  }
  _v0ParseRenderQueue(materialProperties) {
    const isTransparent = materialProperties.keywordMap?.["_ALPHABLEND_ON"] ?? false;
    const enabledZWrite = materialProperties.floatProperties?.["_ZWrite"] === 1;
    let offset = 0;
    if (isTransparent) {
      const v0Queue = materialProperties.renderQueue;
      if (v0Queue != null) {
        if (enabledZWrite) {
          offset = this._renderQueueMapTransparentZWrite.get(v0Queue);
        } else {
          offset = this._renderQueueMapTransparent.get(v0Queue);
        }
      }
    }
    return offset;
  }
  _populateRenderQueueMap(materialPropertiesList) {
    const renderQueuesTransparent = new Set;
    const renderQueuesTransparentZWrite = new Set;
    materialPropertiesList.forEach((materialProperties) => {
      const isTransparent = materialProperties.keywordMap?.["_ALPHABLEND_ON"] ?? false;
      const enabledZWrite = materialProperties.floatProperties?.["_ZWrite"] === 1;
      if (isTransparent) {
        const v0Queue = materialProperties.renderQueue;
        if (v0Queue != null) {
          if (enabledZWrite) {
            renderQueuesTransparentZWrite.add(v0Queue);
          } else {
            renderQueuesTransparent.add(v0Queue);
          }
        }
      }
    });
    if (renderQueuesTransparent.size > 10) {
      console.warn(`VRMMaterialsV0CompatPlugin: This VRM uses ${renderQueuesTransparent.size} render queues for Transparent materials while VRM 1.0 only supports up to 10 render queues. The model might not be rendered correctly.`);
    }
    if (renderQueuesTransparentZWrite.size > 10) {
      console.warn(`VRMMaterialsV0CompatPlugin: This VRM uses ${renderQueuesTransparentZWrite.size} render queues for TransparentZWrite materials while VRM 1.0 only supports up to 10 render queues. The model might not be rendered correctly.`);
    }
    Array.from(renderQueuesTransparent).sort().forEach((queue, i) => {
      const newQueueOffset = Math.min(Math.max(i - renderQueuesTransparent.size + 1, -9), 0);
      this._renderQueueMapTransparent.set(queue, newQueueOffset);
    });
    Array.from(renderQueuesTransparentZWrite).sort().forEach((queue, i) => {
      const newQueueOffset = Math.min(Math.max(i, 0), 9);
      this._renderQueueMapTransparentZWrite.set(queue, newQueueOffset);
    });
  }
}
// packages/three-vrm-node-constraint/src/helpers/VRMNodeConstraintHelper.ts
import * as THREE23 from "three";
var _v3A6 = new THREE23.Vector3;

class VRMNodeConstraintHelper extends THREE23.Group {
  constraint;
  _line;
  _attrPosition;
  constructor(constraint) {
    super();
    this._attrPosition = new THREE23.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0]), 3);
    this._attrPosition.setUsage(THREE23.DynamicDrawUsage);
    const geometry = new THREE23.BufferGeometry;
    geometry.setAttribute("position", this._attrPosition);
    const material = new THREE23.LineBasicMaterial({
      color: 16711935,
      depthTest: false,
      depthWrite: false
    });
    this._line = new THREE23.Line(geometry, material);
    this.add(this._line);
    this.constraint = constraint;
  }
  updateMatrixWorld(force) {
    _v3A6.setFromMatrixPosition(this.constraint.destination.matrixWorld);
    this._attrPosition.setXYZ(0, _v3A6.x, _v3A6.y, _v3A6.z);
    if (this.constraint.source) {
      _v3A6.setFromMatrixPosition(this.constraint.source.matrixWorld);
    }
    this._attrPosition.setXYZ(1, _v3A6.x, _v3A6.y, _v3A6.z);
    this._attrPosition.needsUpdate = true;
    super.updateMatrixWorld(force);
  }
}
// packages/three-vrm-node-constraint/src/VRMAimConstraint.ts
import * as THREE25 from "three";

// packages/three-vrm-node-constraint/src/utils/decomposePosition.ts
function decomposePosition(matrix, target) {
  return target.set(matrix.elements[12], matrix.elements[13], matrix.elements[14]);
}

// packages/three-vrm-node-constraint/src/utils/decomposeRotation.ts
import * as THREE24 from "three";
var _v3A7 = new THREE24.Vector3;
var _v3B4 = new THREE24.Vector3;
function decomposeRotation(matrix, target) {
  matrix.decompose(_v3A7, target, _v3B4);
  return target;
}

// packages/three-vrm-node-constraint/src/utils/quatInvertCompat.ts
function quatInvertCompat2(target) {
  if (target.invert) {
    target.invert();
  } else {
    target.inverse();
  }
  return target;
}

// packages/three-vrm-node-constraint/src/VRMNodeConstraint.ts
class VRMNodeConstraint {
  destination;
  source;
  weight;
  constructor(destination, source) {
    this.destination = destination;
    this.source = source;
    this.weight = 1;
  }
}

// packages/three-vrm-node-constraint/src/VRMAimConstraint.ts
var _v3A8 = new THREE25.Vector3;
var _v3B5 = new THREE25.Vector3;
var _v3C2 = new THREE25.Vector3;
var _quatA7 = new THREE25.Quaternion;
var _quatB4 = new THREE25.Quaternion;
var _quatC2 = new THREE25.Quaternion;

class VRMAimConstraint extends VRMNodeConstraint {
  get aimAxis() {
    return this._aimAxis;
  }
  set aimAxis(aimAxis) {
    this._aimAxis = aimAxis;
    this._v3AimAxis.set(aimAxis === "PositiveX" ? 1 : aimAxis === "NegativeX" ? -1 : 0, aimAxis === "PositiveY" ? 1 : aimAxis === "NegativeY" ? -1 : 0, aimAxis === "PositiveZ" ? 1 : aimAxis === "NegativeZ" ? -1 : 0);
  }
  _aimAxis;
  _v3AimAxis;
  _dstRestQuat;
  get dependencies() {
    const set = new Set([this.source]);
    if (this.destination.parent) {
      set.add(this.destination.parent);
    }
    return set;
  }
  constructor(destination, source) {
    super(destination, source);
    this._aimAxis = "PositiveX";
    this._v3AimAxis = new THREE25.Vector3(1, 0, 0);
    this._dstRestQuat = new THREE25.Quaternion;
  }
  setInitState() {
    this._dstRestQuat.copy(this.destination.quaternion);
  }
  update() {
    this.destination.updateWorldMatrix(true, false);
    this.source.updateWorldMatrix(true, false);
    const dstParentWorldQuat = _quatA7.identity();
    const invDstParentWorldQuat = _quatB4.identity();
    if (this.destination.parent) {
      decomposeRotation(this.destination.parent.matrixWorld, dstParentWorldQuat);
      quatInvertCompat2(invDstParentWorldQuat.copy(dstParentWorldQuat));
    }
    const a0 = _v3A8.copy(this._v3AimAxis).applyQuaternion(this._dstRestQuat).applyQuaternion(dstParentWorldQuat);
    const a1 = decomposePosition(this.source.matrixWorld, _v3B5).sub(decomposePosition(this.destination.matrixWorld, _v3C2)).normalize();
    const targetQuat = _quatC2.setFromUnitVectors(a0, a1).premultiply(invDstParentWorldQuat).multiply(dstParentWorldQuat).multiply(this._dstRestQuat);
    this.destination.quaternion.copy(this._dstRestQuat).slerp(targetQuat, this.weight);
  }
}
// packages/three-vrm-node-constraint/src/utils/traverseAncestorsFromRoot.ts
function traverseAncestorsFromRoot(object, callback) {
  const ancestors = [object];
  let head = object.parent;
  while (head !== null) {
    ancestors.unshift(head);
    head = head.parent;
  }
  ancestors.forEach((ancestor) => {
    callback(ancestor);
  });
}

// packages/three-vrm-node-constraint/src/VRMNodeConstraintManager.ts
class VRMNodeConstraintManager {
  _constraints = new Set;
  get constraints() {
    return this._constraints;
  }
  _objectConstraintsMap = new Map;
  addConstraint(constraint) {
    this._constraints.add(constraint);
    let objectSet = this._objectConstraintsMap.get(constraint.destination);
    if (objectSet == null) {
      objectSet = new Set;
      this._objectConstraintsMap.set(constraint.destination, objectSet);
    }
    objectSet.add(constraint);
  }
  deleteConstraint(constraint) {
    this._constraints.delete(constraint);
    const objectSet = this._objectConstraintsMap.get(constraint.destination);
    objectSet.delete(constraint);
  }
  setInitState() {
    const constraintsTried = new Set;
    const constraintsDone = new Set;
    for (const constraint of this._constraints) {
      this._processConstraint(constraint, constraintsTried, constraintsDone, (constraint) => constraint.setInitState());
    }
  }
  update() {
    const constraintsTried = new Set;
    const constraintsDone = new Set;
    for (const constraint of this._constraints) {
      this._processConstraint(constraint, constraintsTried, constraintsDone, (constraint) => constraint.update());
    }
  }
  _processConstraint(constraint, constraintsTried, constraintsDone, callback) {
    if (constraintsDone.has(constraint)) {
      return;
    }
    if (constraintsTried.has(constraint)) {
      throw new Error("VRMNodeConstraintManager: Circular dependency detected while updating constraints");
    }
    constraintsTried.add(constraint);
    const depObjects = constraint.dependencies;
    for (const depObject of depObjects) {
      traverseAncestorsFromRoot(depObject, (depObjectAncestor) => {
        const objectSet = this._objectConstraintsMap.get(depObjectAncestor);
        if (objectSet) {
          for (const depConstraint of objectSet) {
            this._processConstraint(depConstraint, constraintsTried, constraintsDone, callback);
          }
        }
      });
    }
    callback(constraint);
    constraintsDone.add(constraint);
  }
}

// packages/three-vrm-node-constraint/src/VRMRotationConstraint.ts
import * as THREE26 from "three";
var _quatA8 = new THREE26.Quaternion;
var _quatB5 = new THREE26.Quaternion;

class VRMRotationConstraint extends VRMNodeConstraint {
  _dstRestQuat;
  _invSrcRestQuat;
  get dependencies() {
    return new Set([this.source]);
  }
  constructor(destination, source) {
    super(destination, source);
    this._dstRestQuat = new THREE26.Quaternion;
    this._invSrcRestQuat = new THREE26.Quaternion;
  }
  setInitState() {
    this._dstRestQuat.copy(this.destination.quaternion);
    quatInvertCompat2(this._invSrcRestQuat.copy(this.source.quaternion));
  }
  update() {
    const srcDeltaQuat = _quatA8.copy(this._invSrcRestQuat).multiply(this.source.quaternion);
    const targetQuat = _quatB5.copy(this._dstRestQuat).multiply(srcDeltaQuat);
    this.destination.quaternion.copy(this._dstRestQuat).slerp(targetQuat, this.weight);
  }
}

// packages/three-vrm-node-constraint/src/VRMRollConstraint.ts
import * as THREE27 from "three";
var _v3A9 = new THREE27.Vector3;
var _quatA9 = new THREE27.Quaternion;
var _quatB6 = new THREE27.Quaternion;

class VRMRollConstraint extends VRMNodeConstraint {
  get rollAxis() {
    return this._rollAxis;
  }
  set rollAxis(rollAxis) {
    this._rollAxis = rollAxis;
    this._v3RollAxis.set(rollAxis === "X" ? 1 : 0, rollAxis === "Y" ? 1 : 0, rollAxis === "Z" ? 1 : 0);
  }
  _rollAxis;
  _v3RollAxis;
  _dstRestQuat;
  _invDstRestQuat;
  _invSrcRestQuatMulDstRestQuat;
  get dependencies() {
    return new Set([this.source]);
  }
  constructor(destination, source) {
    super(destination, source);
    this._rollAxis = "X";
    this._v3RollAxis = new THREE27.Vector3(1, 0, 0);
    this._dstRestQuat = new THREE27.Quaternion;
    this._invDstRestQuat = new THREE27.Quaternion;
    this._invSrcRestQuatMulDstRestQuat = new THREE27.Quaternion;
  }
  setInitState() {
    this._dstRestQuat.copy(this.destination.quaternion);
    quatInvertCompat2(this._invDstRestQuat.copy(this._dstRestQuat));
    quatInvertCompat2(this._invSrcRestQuatMulDstRestQuat.copy(this.source.quaternion)).multiply(this._dstRestQuat);
  }
  update() {
    const quatDelta = _quatA9.copy(this._invDstRestQuat).multiply(this.source.quaternion).multiply(this._invSrcRestQuatMulDstRestQuat);
    const n1 = _v3A9.copy(this._v3RollAxis).applyQuaternion(quatDelta);
    const quatFromTo = _quatB6.setFromUnitVectors(n1, this._v3RollAxis);
    const targetQuat = quatFromTo.premultiply(this._dstRestQuat).multiply(quatDelta);
    this.destination.quaternion.copy(this._dstRestQuat).slerp(targetQuat, this.weight);
  }
}

// packages/three-vrm-node-constraint/src/VRMNodeConstraintLoaderPlugin.ts
var POSSIBLE_SPEC_VERSIONS7 = new Set(["1.0", "1.0-beta"]);

class VRMNodeConstraintLoaderPlugin {
  static EXTENSION_NAME = "VRMC_node_constraint";
  helperRoot;
  parser;
  get name() {
    return VRMNodeConstraintLoaderPlugin.EXTENSION_NAME;
  }
  constructor(parser, options) {
    this.parser = parser;
    this.helperRoot = options?.helperRoot;
  }
  async afterRoot(gltf) {
    gltf.userData.vrmNodeConstraintManager = await this._import(gltf);
  }
  async _import(gltf) {
    const json = this.parser.json;
    const isConstraintsUsed = json.extensionsUsed?.indexOf(VRMNodeConstraintLoaderPlugin.EXTENSION_NAME) !== -1;
    if (!isConstraintsUsed) {
      return null;
    }
    const manager = new VRMNodeConstraintManager;
    const threeNodes = await this.parser.getDependencies("node");
    threeNodes.forEach((node, nodeIndex) => {
      const schemaNode = json.nodes[nodeIndex];
      const extension = schemaNode?.extensions?.[VRMNodeConstraintLoaderPlugin.EXTENSION_NAME];
      if (extension == null) {
        return;
      }
      const specVersion = extension.specVersion;
      if (!POSSIBLE_SPEC_VERSIONS7.has(specVersion)) {
        console.warn(`VRMNodeConstraintLoaderPlugin: Unknown ${VRMNodeConstraintLoaderPlugin.EXTENSION_NAME} specVersion "${specVersion}"`);
        return;
      }
      const constraintDef = extension.constraint;
      if (constraintDef.roll != null) {
        const constraint = this._importRollConstraint(node, threeNodes, constraintDef.roll);
        manager.addConstraint(constraint);
      } else if (constraintDef.aim != null) {
        const constraint = this._importAimConstraint(node, threeNodes, constraintDef.aim);
        manager.addConstraint(constraint);
      } else if (constraintDef.rotation != null) {
        const constraint = this._importRotationConstraint(node, threeNodes, constraintDef.rotation);
        manager.addConstraint(constraint);
      }
    });
    gltf.scene.updateMatrixWorld();
    manager.setInitState();
    return manager;
  }
  _importRollConstraint(destination, nodes, rollConstraintDef) {
    const { source: sourceIndex, rollAxis, weight } = rollConstraintDef;
    const source = nodes[sourceIndex];
    const constraint = new VRMRollConstraint(destination, source);
    if (rollAxis != null) {
      constraint.rollAxis = rollAxis;
    }
    if (weight != null) {
      constraint.weight = weight;
    }
    if (this.helperRoot) {
      const helper = new VRMNodeConstraintHelper(constraint);
      this.helperRoot.add(helper);
    }
    return constraint;
  }
  _importAimConstraint(destination, nodes, aimConstraintDef) {
    const { source: sourceIndex, aimAxis, weight } = aimConstraintDef;
    const source = nodes[sourceIndex];
    const constraint = new VRMAimConstraint(destination, source);
    if (aimAxis != null) {
      constraint.aimAxis = aimAxis;
    }
    if (weight != null) {
      constraint.weight = weight;
    }
    if (this.helperRoot) {
      const helper = new VRMNodeConstraintHelper(constraint);
      this.helperRoot.add(helper);
    }
    return constraint;
  }
  _importRotationConstraint(destination, nodes, rotationConstraintDef) {
    const { source: sourceIndex, weight } = rotationConstraintDef;
    const source = nodes[sourceIndex];
    const constraint = new VRMRotationConstraint(destination, source);
    if (weight != null) {
      constraint.weight = weight;
    }
    if (this.helperRoot) {
      const helper = new VRMNodeConstraintHelper(constraint);
      this.helperRoot.add(helper);
    }
    return constraint;
  }
}
// packages/three-vrm-springbone/src/helpers/VRMSpringBoneColliderHelper.ts
import * as THREE32 from "three";

// packages/three-vrm-springbone/src/VRMSpringBoneColliderShapeCapsule.ts
import * as THREE28 from "three";

// packages/three-vrm-springbone/src/VRMSpringBoneColliderShape.ts
class VRMSpringBoneColliderShape {
}

// packages/three-vrm-springbone/src/VRMSpringBoneColliderShapeCapsule.ts
var _v3A10 = new THREE28.Vector3;
var _v3B6 = new THREE28.Vector3;

class VRMSpringBoneColliderShapeCapsule extends VRMSpringBoneColliderShape {
  get type() {
    return "capsule";
  }
  offset;
  tail;
  radius;
  constructor(params) {
    super();
    this.offset = params?.offset ?? new THREE28.Vector3(0, 0, 0);
    this.tail = params?.tail ?? new THREE28.Vector3(0, 0, 0);
    this.radius = params?.radius ?? 0;
  }
  calculateCollision(colliderMatrix, objectPosition, objectRadius, target) {
    _v3A10.copy(this.offset).applyMatrix4(colliderMatrix);
    _v3B6.copy(this.tail).applyMatrix4(colliderMatrix);
    _v3B6.sub(_v3A10);
    const lengthSqCapsule = _v3B6.lengthSq();
    target.copy(objectPosition).sub(_v3A10);
    const dot = _v3B6.dot(target);
    if (dot <= 0) {} else if (lengthSqCapsule <= dot) {
      target.sub(_v3B6);
    } else {
      _v3B6.multiplyScalar(dot / lengthSqCapsule);
      target.sub(_v3B6);
    }
    const radius = objectRadius + this.radius;
    const distance = target.length() - radius;
    target.normalize();
    return distance;
  }
}

// packages/three-vrm-springbone/src/VRMSpringBoneColliderShapeSphere.ts
import * as THREE29 from "three";
class VRMSpringBoneColliderShapeSphere extends VRMSpringBoneColliderShape {
  get type() {
    return "sphere";
  }
  offset;
  radius;
  constructor(params) {
    super();
    this.offset = params?.offset ?? new THREE29.Vector3(0, 0, 0);
    this.radius = params?.radius ?? 0;
  }
  calculateCollision(colliderMatrix, objectPosition, objectRadius, target) {
    target.copy(this.offset).applyMatrix4(colliderMatrix);
    target.negate().add(objectPosition);
    const radius = objectRadius + this.radius;
    const distance = target.length() - radius;
    target.normalize();
    return distance;
  }
}

// packages/three-vrm-springbone/src/helpers/utils/ColliderShapeCapsuleBufferGeometry.ts
import * as THREE30 from "three";
var _v3A11 = new THREE30.Vector3;

class ColliderShapeCapsuleBufferGeometry extends THREE30.BufferGeometry {
  worldScale = 1;
  _attrPos;
  _attrIndex;
  _shape;
  _currentRadius = 0;
  _currentOffset = new THREE30.Vector3;
  _currentTail = new THREE30.Vector3;
  constructor(shape) {
    super();
    this._shape = shape;
    this._attrPos = new THREE30.BufferAttribute(new Float32Array(396), 3);
    this.setAttribute("position", this._attrPos);
    this._attrIndex = new THREE30.BufferAttribute(new Uint16Array(264), 1);
    this.setIndex(this._attrIndex);
    this._buildIndex();
    this.update();
  }
  update() {
    let shouldUpdateGeometry = false;
    const radius = this._shape.radius / this.worldScale;
    if (this._currentRadius !== radius) {
      this._currentRadius = radius;
      shouldUpdateGeometry = true;
    }
    if (!this._currentOffset.equals(this._shape.offset)) {
      this._currentOffset.copy(this._shape.offset);
      shouldUpdateGeometry = true;
    }
    const tail = _v3A11.copy(this._shape.tail).divideScalar(this.worldScale);
    if (this._currentTail.distanceToSquared(tail) > 0.0000000001) {
      this._currentTail.copy(tail);
      shouldUpdateGeometry = true;
    }
    if (shouldUpdateGeometry) {
      this._buildPosition();
    }
  }
  _buildPosition() {
    _v3A11.copy(this._currentTail).sub(this._currentOffset);
    const l = _v3A11.length() / this._currentRadius;
    for (let i = 0;i <= 16; i++) {
      const t = i / 16 * Math.PI;
      this._attrPos.setXYZ(i, -Math.sin(t), -Math.cos(t), 0);
      this._attrPos.setXYZ(17 + i, l + Math.sin(t), Math.cos(t), 0);
      this._attrPos.setXYZ(34 + i, -Math.sin(t), 0, -Math.cos(t));
      this._attrPos.setXYZ(51 + i, l + Math.sin(t), 0, Math.cos(t));
    }
    for (let i = 0;i < 32; i++) {
      const t = i / 16 * Math.PI;
      this._attrPos.setXYZ(68 + i, 0, Math.sin(t), Math.cos(t));
      this._attrPos.setXYZ(100 + i, l, Math.sin(t), Math.cos(t));
    }
    const theta = Math.atan2(_v3A11.y, Math.sqrt(_v3A11.x * _v3A11.x + _v3A11.z * _v3A11.z));
    const phi = -Math.atan2(_v3A11.z, _v3A11.x);
    this.rotateZ(theta);
    this.rotateY(phi);
    this.scale(this._currentRadius, this._currentRadius, this._currentRadius);
    this.translate(this._currentOffset.x, this._currentOffset.y, this._currentOffset.z);
    this._attrPos.needsUpdate = true;
  }
  _buildIndex() {
    for (let i = 0;i < 34; i++) {
      const i1 = (i + 1) % 34;
      this._attrIndex.setXY(i * 2, i, i1);
      this._attrIndex.setXY(68 + i * 2, 34 + i, 34 + i1);
    }
    for (let i = 0;i < 32; i++) {
      const i1 = (i + 1) % 32;
      this._attrIndex.setXY(136 + i * 2, 68 + i, 68 + i1);
      this._attrIndex.setXY(200 + i * 2, 100 + i, 100 + i1);
    }
    this._attrIndex.needsUpdate = true;
  }
}

// packages/three-vrm-springbone/src/helpers/utils/ColliderShapeSphereBufferGeometry.ts
import * as THREE31 from "three";

class ColliderShapeSphereBufferGeometry extends THREE31.BufferGeometry {
  worldScale = 1;
  _attrPos;
  _attrIndex;
  _shape;
  _currentRadius = 0;
  _currentOffset = new THREE31.Vector3;
  constructor(shape) {
    super();
    this._shape = shape;
    this._attrPos = new THREE31.BufferAttribute(new Float32Array(32 * 3 * 3), 3);
    this.setAttribute("position", this._attrPos);
    this._attrIndex = new THREE31.BufferAttribute(new Uint16Array(64 * 3), 1);
    this.setIndex(this._attrIndex);
    this._buildIndex();
    this.update();
  }
  update() {
    let shouldUpdateGeometry = false;
    const radius = this._shape.radius / this.worldScale;
    if (this._currentRadius !== radius) {
      this._currentRadius = radius;
      shouldUpdateGeometry = true;
    }
    if (!this._currentOffset.equals(this._shape.offset)) {
      this._currentOffset.copy(this._shape.offset);
      shouldUpdateGeometry = true;
    }
    if (shouldUpdateGeometry) {
      this._buildPosition();
    }
  }
  _buildPosition() {
    for (let i = 0;i < 32; i++) {
      const t = i / 16 * Math.PI;
      this._attrPos.setXYZ(i, Math.cos(t), Math.sin(t), 0);
      this._attrPos.setXYZ(32 + i, 0, Math.cos(t), Math.sin(t));
      this._attrPos.setXYZ(64 + i, Math.sin(t), 0, Math.cos(t));
    }
    this.scale(this._currentRadius, this._currentRadius, this._currentRadius);
    this.translate(this._currentOffset.x, this._currentOffset.y, this._currentOffset.z);
    this._attrPos.needsUpdate = true;
  }
  _buildIndex() {
    for (let i = 0;i < 32; i++) {
      const i1 = (i + 1) % 32;
      this._attrIndex.setXY(i * 2, i, i1);
      this._attrIndex.setXY(64 + i * 2, 32 + i, 32 + i1);
      this._attrIndex.setXY(128 + i * 2, 64 + i, 64 + i1);
    }
    this._attrIndex.needsUpdate = true;
  }
}

// packages/three-vrm-springbone/src/helpers/VRMSpringBoneColliderHelper.ts
var _v3A12 = new THREE32.Vector3;

class VRMSpringBoneColliderHelper extends THREE32.Group {
  collider;
  _geometry;
  _line;
  constructor(collider) {
    super();
    this.matrixAutoUpdate = false;
    this.collider = collider;
    if (this.collider.shape instanceof VRMSpringBoneColliderShapeSphere) {
      this._geometry = new ColliderShapeSphereBufferGeometry(this.collider.shape);
    } else if (this.collider.shape instanceof VRMSpringBoneColliderShapeCapsule) {
      this._geometry = new ColliderShapeCapsuleBufferGeometry(this.collider.shape);
    } else {
      throw new Error("VRMSpringBoneColliderHelper: Unknown collider shape type detected");
    }
    const material = new THREE32.LineBasicMaterial({
      color: 16711935,
      depthTest: false,
      depthWrite: false
    });
    this._line = new THREE32.LineSegments(this._geometry, material);
    this.add(this._line);
  }
  dispose() {
    this._geometry.dispose();
  }
  updateMatrixWorld(force) {
    this.collider.updateWorldMatrix(true, false);
    this.matrix.copy(this.collider.matrixWorld);
    const matrixWorldElements = this.matrix.elements;
    this._geometry.worldScale = _v3A12.set(matrixWorldElements[0], matrixWorldElements[1], matrixWorldElements[2]).length();
    this._geometry.update();
    super.updateMatrixWorld(force);
  }
}
// packages/three-vrm-springbone/src/helpers/VRMSpringBoneJointHelper.ts
import * as THREE34 from "three";

// packages/three-vrm-springbone/src/helpers/utils/SpringBoneBufferGeometry.ts
import * as THREE33 from "three";

class SpringBoneBufferGeometry extends THREE33.BufferGeometry {
  worldScale = 1;
  _attrPos;
  _attrIndex;
  _springBone;
  _currentRadius = 0;
  _currentTail = new THREE33.Vector3;
  constructor(springBone) {
    super();
    this._springBone = springBone;
    this._attrPos = new THREE33.BufferAttribute(new Float32Array(294), 3);
    this.setAttribute("position", this._attrPos);
    this._attrIndex = new THREE33.BufferAttribute(new Uint16Array(194), 1);
    this.setIndex(this._attrIndex);
    this._buildIndex();
    this.update();
  }
  update() {
    let shouldUpdateGeometry = false;
    const radius = this._springBone.settings.hitRadius / this.worldScale;
    if (this._currentRadius !== radius) {
      this._currentRadius = radius;
      shouldUpdateGeometry = true;
    }
    if (!this._currentTail.equals(this._springBone.initialLocalChildPosition)) {
      this._currentTail.copy(this._springBone.initialLocalChildPosition);
      shouldUpdateGeometry = true;
    }
    if (shouldUpdateGeometry) {
      this._buildPosition();
    }
  }
  _buildPosition() {
    for (let i = 0;i < 32; i++) {
      const t = i / 16 * Math.PI;
      this._attrPos.setXYZ(i, Math.cos(t), Math.sin(t), 0);
      this._attrPos.setXYZ(32 + i, 0, Math.cos(t), Math.sin(t));
      this._attrPos.setXYZ(64 + i, Math.sin(t), 0, Math.cos(t));
    }
    this.scale(this._currentRadius, this._currentRadius, this._currentRadius);
    this.translate(this._currentTail.x, this._currentTail.y, this._currentTail.z);
    this._attrPos.setXYZ(96, 0, 0, 0);
    this._attrPos.setXYZ(97, this._currentTail.x, this._currentTail.y, this._currentTail.z);
    this._attrPos.needsUpdate = true;
  }
  _buildIndex() {
    for (let i = 0;i < 32; i++) {
      const i1 = (i + 1) % 32;
      this._attrIndex.setXY(i * 2, i, i1);
      this._attrIndex.setXY(64 + i * 2, 32 + i, 32 + i1);
      this._attrIndex.setXY(128 + i * 2, 64 + i, 64 + i1);
    }
    this._attrIndex.setXY(192, 96, 97);
    this._attrIndex.needsUpdate = true;
  }
}

// packages/three-vrm-springbone/src/helpers/VRMSpringBoneJointHelper.ts
var _v3A13 = new THREE34.Vector3;

class VRMSpringBoneJointHelper extends THREE34.Group {
  springBone;
  _geometry;
  _line;
  constructor(springBone) {
    super();
    this.matrixAutoUpdate = false;
    this.springBone = springBone;
    this._geometry = new SpringBoneBufferGeometry(this.springBone);
    const material = new THREE34.LineBasicMaterial({
      color: 16776960,
      depthTest: false,
      depthWrite: false
    });
    this._line = new THREE34.LineSegments(this._geometry, material);
    this.add(this._line);
  }
  dispose() {
    this._geometry.dispose();
  }
  updateMatrixWorld(force) {
    this.springBone.bone.updateWorldMatrix(true, false);
    this.matrix.copy(this.springBone.bone.matrixWorld);
    const matrixWorldElements = this.matrix.elements;
    this._geometry.worldScale = _v3A13.set(matrixWorldElements[0], matrixWorldElements[1], matrixWorldElements[2]).length();
    this._geometry.update();
    super.updateMatrixWorld(force);
  }
}
// packages/three-vrm-springbone/src/VRMSpringBoneCollider.ts
import * as THREE35 from "three";

class VRMSpringBoneCollider extends THREE35.Object3D {
  shape;
  constructor(shape) {
    super();
    this.shape = shape;
  }
}
// packages/three-vrm-springbone/src/VRMSpringBoneJoint.ts
import * as THREE38 from "three";

// packages/three-vrm-springbone/src/utils/mat4InvertCompat.ts
import * as THREE36 from "three";
var _matA = new THREE36.Matrix4;
function mat4InvertCompat(target) {
  if (target.invert) {
    target.invert();
  } else {
    target.getInverse(_matA.copy(target));
  }
  return target;
}

// packages/three-vrm-springbone/src/utils/Matrix4InverseCache.ts
import * as THREE37 from "three";
class Matrix4InverseCache {
  matrix;
  _inverseCache = new THREE37.Matrix4;
  _shouldUpdateInverse = true;
  _originalElements;
  get inverse() {
    if (this._shouldUpdateInverse) {
      mat4InvertCompat(this._inverseCache.copy(this.matrix));
      this._shouldUpdateInverse = false;
    }
    return this._inverseCache;
  }
  constructor(matrix) {
    this.matrix = matrix;
    const handler = {
      set: (obj, prop, newVal) => {
        this._shouldUpdateInverse = true;
        obj[prop] = newVal;
        return true;
      }
    };
    this._originalElements = matrix.elements;
    matrix.elements = new Proxy(matrix.elements, handler);
  }
  revert() {
    this.matrix.elements = this._originalElements;
  }
}

// packages/three-vrm-springbone/src/VRMSpringBoneJoint.ts
var IDENTITY_MATRIX4 = new THREE38.Matrix4;
var _v3A14 = new THREE38.Vector3;
var _v3B7 = new THREE38.Vector3;
var _v3C3 = new THREE38.Vector3;
var _worldSpacePosition = new THREE38.Vector3;
var _centerSpacePosition = new THREE38.Vector3;
var _nextTail = new THREE38.Vector3;
var _quatA10 = new THREE38.Quaternion;
var _matA2 = new THREE38.Matrix4;
var _matB = new THREE38.Matrix4;

class VRMSpringBoneJoint {
  settings;
  colliderGroups;
  bone;
  child;
  _currentTail = new THREE38.Vector3;
  _prevTail = new THREE38.Vector3;
  _boneAxis = new THREE38.Vector3;
  _worldSpaceBoneLength = 0;
  _center = null;
  get center() {
    return this._center;
  }
  set center(center) {
    if (this._center?.userData.inverseCacheProxy) {
      this._center.userData.inverseCacheProxy.revert();
      delete this._center.userData.inverseCacheProxy;
    }
    this._center = center;
    if (this._center) {
      if (!this._center.userData.inverseCacheProxy) {
        this._center.userData.inverseCacheProxy = new Matrix4InverseCache(this._center.matrixWorld);
      }
    }
  }
  _initialLocalMatrix = new THREE38.Matrix4;
  _initialLocalRotation = new THREE38.Quaternion;
  _initialLocalChildPosition = new THREE38.Vector3;
  get initialLocalChildPosition() {
    return this._initialLocalChildPosition;
  }
  get _parentMatrixWorld() {
    return this.bone.parent ? this.bone.parent.matrixWorld : IDENTITY_MATRIX4;
  }
  constructor(bone, child, settings = {}, colliderGroups = []) {
    this.bone = bone;
    this.bone.matrixAutoUpdate = false;
    this.child = child;
    this.settings = {
      hitRadius: settings.hitRadius ?? 0,
      stiffness: settings.stiffness ?? 1,
      gravityPower: settings.gravityPower ?? 0,
      gravityDir: settings.gravityDir?.clone() ?? new THREE38.Vector3(0, -1, 0),
      dragForce: settings.dragForce ?? 0.4
    };
    this.colliderGroups = colliderGroups;
  }
  setInitState() {
    this._initialLocalMatrix.copy(this.bone.matrix);
    this._initialLocalRotation.copy(this.bone.quaternion);
    if (this.child) {
      this._initialLocalChildPosition.copy(this.child.position);
    } else {
      this._initialLocalChildPosition.copy(this.bone.position).normalize().multiplyScalar(0.07);
    }
    const matrixWorldToCenter = this._getMatrixWorldToCenter(_matA2);
    this.bone.localToWorld(this._currentTail.copy(this._initialLocalChildPosition)).applyMatrix4(matrixWorldToCenter);
    this._prevTail.copy(this._currentTail);
    this._boneAxis.copy(this._initialLocalChildPosition).normalize();
  }
  reset() {
    this.bone.quaternion.copy(this._initialLocalRotation);
    this.bone.updateMatrix();
    this.bone.matrixWorld.multiplyMatrices(this._parentMatrixWorld, this.bone.matrix);
    const matrixWorldToCenter = this._getMatrixWorldToCenter(_matA2);
    this.bone.localToWorld(this._currentTail.copy(this._initialLocalChildPosition)).applyMatrix4(matrixWorldToCenter);
    this._prevTail.copy(this._currentTail);
  }
  update(delta) {
    if (delta <= 0)
      return;
    this._calcWorldSpaceBoneLength();
    _worldSpacePosition.setFromMatrixPosition(this.bone.matrixWorld);
    let matrixWorldToCenter = this._getMatrixWorldToCenter(_matA2);
    _centerSpacePosition.copy(_worldSpacePosition).applyMatrix4(matrixWorldToCenter);
    const quatWorldToCenter = _quatA10.setFromRotationMatrix(matrixWorldToCenter);
    const centerSpaceParentMatrix = _matB.copy(matrixWorldToCenter).multiply(this._parentMatrixWorld);
    const centerSpaceBoneAxis = _v3B7.copy(this._boneAxis).applyMatrix4(this._initialLocalMatrix).applyMatrix4(centerSpaceParentMatrix).sub(_centerSpacePosition).normalize();
    const centerSpaceGravity = _v3C3.copy(this.settings.gravityDir).applyQuaternion(quatWorldToCenter).normalize();
    const matrixCenterToWorld = this._getMatrixCenterToWorld(_matA2);
    _nextTail.copy(this._currentTail).add(_v3A14.copy(this._currentTail).sub(this._prevTail).multiplyScalar(1 - this.settings.dragForce)).add(_v3A14.copy(centerSpaceBoneAxis).multiplyScalar(this.settings.stiffness * delta)).add(_v3A14.copy(centerSpaceGravity).multiplyScalar(this.settings.gravityPower * delta)).applyMatrix4(matrixCenterToWorld);
    _nextTail.sub(_worldSpacePosition).normalize().multiplyScalar(this._worldSpaceBoneLength).add(_worldSpacePosition);
    this._collision(_nextTail);
    matrixWorldToCenter = this._getMatrixWorldToCenter(_matA2);
    this._prevTail.copy(this._currentTail);
    this._currentTail.copy(_v3A14.copy(_nextTail).applyMatrix4(matrixWorldToCenter));
    const worldSpaceInitialMatrixInv = mat4InvertCompat(_matA2.copy(this._parentMatrixWorld).multiply(this._initialLocalMatrix));
    const applyRotation = _quatA10.setFromUnitVectors(this._boneAxis, _v3A14.copy(_nextTail).applyMatrix4(worldSpaceInitialMatrixInv).normalize());
    this.bone.quaternion.copy(this._initialLocalRotation).multiply(applyRotation);
    this.bone.updateMatrix();
    this.bone.matrixWorld.multiplyMatrices(this._parentMatrixWorld, this.bone.matrix);
  }
  _collision(tail) {
    this.colliderGroups.forEach((colliderGroup) => {
      colliderGroup.colliders.forEach((collider) => {
        const dist = collider.shape.calculateCollision(collider.matrixWorld, tail, this.settings.hitRadius, _v3A14);
        if (dist < 0) {
          tail.add(_v3A14.multiplyScalar(-dist));
          tail.sub(_worldSpacePosition).normalize().multiplyScalar(this._worldSpaceBoneLength).add(_worldSpacePosition);
        }
      });
    });
  }
  _calcWorldSpaceBoneLength() {
    _v3A14.setFromMatrixPosition(this.bone.matrixWorld);
    if (this.child) {
      _v3B7.setFromMatrixPosition(this.child.matrixWorld);
    } else {
      _v3B7.copy(this._initialLocalChildPosition);
      _v3B7.applyMatrix4(this.bone.matrixWorld);
    }
    this._worldSpaceBoneLength = _v3A14.sub(_v3B7).length();
  }
  _getMatrixCenterToWorld(target) {
    if (this._center) {
      target.copy(this._center.matrixWorld);
    } else {
      target.identity();
    }
    return target;
  }
  _getMatrixWorldToCenter(target) {
    if (this._center) {
      target.copy(this._center.userData.inverseCacheProxy.inverse);
    } else {
      target.identity();
    }
    return target;
  }
}
// packages/three-vrm-springbone/src/VRMSpringBoneLoaderPlugin.ts
import * as THREE39 from "three";

// packages/three-vrm-springbone/src/utils/traverseAncestorsFromRoot.ts
function traverseAncestorsFromRoot2(object, callback) {
  const ancestors = [];
  let head = object;
  while (head !== null) {
    ancestors.unshift(head);
    head = head.parent;
  }
  ancestors.forEach((ancestor) => {
    callback(ancestor);
  });
}

// packages/three-vrm-springbone/src/utils/traverseChildrenUntilConditionMet.ts
function traverseChildrenUntilConditionMet(object, callback) {
  object.children.forEach((child) => {
    const result = callback(child);
    if (!result) {
      traverseChildrenUntilConditionMet(child, callback);
    }
  });
}

// packages/three-vrm-springbone/src/VRMSpringBoneManager.ts
class VRMSpringBoneManager {
  _joints = new Set;
  get joints() {
    return this._joints;
  }
  get springBones() {
    console.warn("VRMSpringBoneManager: springBones is deprecated. use joints instead.");
    return this._joints;
  }
  get colliderGroups() {
    const set = new Set;
    this._joints.forEach((springBone) => {
      springBone.colliderGroups.forEach((colliderGroup) => {
        set.add(colliderGroup);
      });
    });
    return Array.from(set);
  }
  get colliders() {
    const set = new Set;
    this.colliderGroups.forEach((colliderGroup) => {
      colliderGroup.colliders.forEach((collider) => {
        set.add(collider);
      });
    });
    return Array.from(set);
  }
  _objectSpringBonesMap = new Map;
  addJoint(joint) {
    this._joints.add(joint);
    let objectSet = this._objectSpringBonesMap.get(joint.bone);
    if (objectSet == null) {
      objectSet = new Set;
      this._objectSpringBonesMap.set(joint.bone, objectSet);
    }
    objectSet.add(joint);
  }
  addSpringBone(joint) {
    console.warn("VRMSpringBoneManager: addSpringBone() is deprecated. use addJoint() instead.");
    this.addJoint(joint);
  }
  deleteJoint(joint) {
    this._joints.delete(joint);
    const objectSet = this._objectSpringBonesMap.get(joint.bone);
    objectSet.delete(joint);
  }
  deleteSpringBone(joint) {
    console.warn("VRMSpringBoneManager: deleteSpringBone() is deprecated. use deleteJoint() instead.");
    this.deleteJoint(joint);
  }
  setInitState() {
    const springBonesTried = new Set;
    const springBonesDone = new Set;
    const objectUpdated = new Set;
    for (const springBone of this._joints) {
      this._processSpringBone(springBone, springBonesTried, springBonesDone, objectUpdated, (springBone) => springBone.setInitState());
    }
  }
  reset() {
    const springBonesTried = new Set;
    const springBonesDone = new Set;
    const objectUpdated = new Set;
    for (const springBone of this._joints) {
      this._processSpringBone(springBone, springBonesTried, springBonesDone, objectUpdated, (springBone) => springBone.reset());
    }
  }
  update(delta) {
    const springBonesTried = new Set;
    const springBonesDone = new Set;
    const objectUpdated = new Set;
    for (const springBone of this._joints) {
      this._processSpringBone(springBone, springBonesTried, springBonesDone, objectUpdated, (springBone) => springBone.update(delta));
      traverseChildrenUntilConditionMet(springBone.bone, (object) => {
        if ((this._objectSpringBonesMap.get(object)?.size ?? 0) > 0) {
          return true;
        }
        object.updateWorldMatrix(false, false);
        return false;
      });
    }
  }
  _processSpringBone(springBone, springBonesTried, springBonesDone, objectUpdated, callback) {
    if (springBonesDone.has(springBone)) {
      return;
    }
    if (springBonesTried.has(springBone)) {
      throw new Error("VRMSpringBoneManager: Circular dependency detected while updating springbones");
    }
    springBonesTried.add(springBone);
    const depObjects = this._getDependencies(springBone);
    for (const depObject of depObjects) {
      traverseAncestorsFromRoot2(depObject, (depObjectAncestor) => {
        const objectSet = this._objectSpringBonesMap.get(depObjectAncestor);
        if (objectSet) {
          for (const depSpringBone of objectSet) {
            this._processSpringBone(depSpringBone, springBonesTried, springBonesDone, objectUpdated, callback);
          }
        } else if (!objectUpdated.has(depObjectAncestor)) {
          depObjectAncestor.updateWorldMatrix(false, false);
          objectUpdated.add(depObjectAncestor);
        }
      });
    }
    springBone.bone.updateMatrix();
    springBone.bone.updateWorldMatrix(false, false);
    callback(springBone);
    objectUpdated.add(springBone.bone);
    springBonesDone.add(springBone);
  }
  _getDependencies(springBone) {
    const set = new Set;
    const parent = springBone.bone.parent;
    if (parent) {
      set.add(parent);
    }
    springBone.colliderGroups.forEach((colliderGroup) => {
      colliderGroup.colliders.forEach((collider) => {
        set.add(collider);
      });
    });
    return set;
  }
}

// packages/three-vrm-springbone/src/VRMSpringBoneLoaderPlugin.ts
var POSSIBLE_SPEC_VERSIONS8 = new Set(["1.0", "1.0-beta"]);

class VRMSpringBoneLoaderPlugin {
  static EXTENSION_NAME = "VRMC_springBone";
  jointHelperRoot;
  colliderHelperRoot;
  parser;
  get name() {
    return VRMSpringBoneLoaderPlugin.EXTENSION_NAME;
  }
  constructor(parser, options) {
    this.parser = parser;
    this.jointHelperRoot = options?.jointHelperRoot;
    this.colliderHelperRoot = options?.colliderHelperRoot;
  }
  async afterRoot(gltf) {
    gltf.userData.vrmSpringBoneManager = await this._import(gltf);
  }
  async _import(gltf) {
    const v1Result = await this._v1Import(gltf);
    if (v1Result != null) {
      return v1Result;
    }
    const v0Result = await this._v0Import(gltf);
    if (v0Result != null) {
      return v0Result;
    }
    return null;
  }
  async _v1Import(gltf) {
    const json = gltf.parser.json;
    const isSpringBoneUsed = json.extensionsUsed?.indexOf(VRMSpringBoneLoaderPlugin.EXTENSION_NAME) !== -1;
    if (!isSpringBoneUsed) {
      return null;
    }
    const manager = new VRMSpringBoneManager;
    const threeNodes = await gltf.parser.getDependencies("node");
    const extension = json.extensions?.[VRMSpringBoneLoaderPlugin.EXTENSION_NAME];
    if (!extension) {
      return null;
    }
    const specVersion = extension.specVersion;
    if (!POSSIBLE_SPEC_VERSIONS8.has(specVersion)) {
      console.warn(`VRMSpringBoneLoaderPlugin: Unknown ${VRMSpringBoneLoaderPlugin.EXTENSION_NAME} specVersion "${specVersion}"`);
      return null;
    }
    const colliders = extension.colliders?.map((schemaCollider, iCollider) => {
      const node = threeNodes[schemaCollider.node];
      const schemaShape = schemaCollider.shape;
      if (schemaShape.sphere) {
        return this._importSphereCollider(node, {
          offset: new THREE39.Vector3().fromArray(schemaShape.sphere.offset ?? [0, 0, 0]),
          radius: schemaShape.sphere.radius ?? 0
        });
      } else if (schemaShape.capsule) {
        return this._importCapsuleCollider(node, {
          offset: new THREE39.Vector3().fromArray(schemaShape.capsule.offset ?? [0, 0, 0]),
          radius: schemaShape.capsule.radius ?? 0,
          tail: new THREE39.Vector3().fromArray(schemaShape.capsule.tail ?? [0, 0, 0])
        });
      }
      throw new Error(`VRMSpringBoneLoaderPlugin: The collider #${iCollider} has no valid shape`);
    });
    const colliderGroups = extension.colliderGroups?.map((schemaColliderGroup, iColliderGroup) => {
      const cols = (schemaColliderGroup.colliders ?? []).map((iCollider) => {
        const col = colliders?.[iCollider];
        if (col == null) {
          throw new Error(`VRMSpringBoneLoaderPlugin: The colliderGroup #${iColliderGroup} attempted to use a collider #${iCollider} but not found`);
        }
        return col;
      });
      return {
        colliders: cols,
        name: schemaColliderGroup.name
      };
    });
    extension.springs?.forEach((schemaSpring, iSpring) => {
      const schemaJoints = schemaSpring.joints;
      const colliderGroupsForSpring = schemaSpring.colliderGroups?.map((iColliderGroup) => {
        const group = colliderGroups?.[iColliderGroup];
        if (group == null) {
          throw new Error(`VRMSpringBoneLoaderPlugin: The spring #${iSpring} attempted to use a colliderGroup ${iColliderGroup} but not found`);
        }
        return group;
      });
      const center = schemaSpring.center != null ? threeNodes[schemaSpring.center] : undefined;
      let prevSchemaJoint;
      schemaJoints.forEach((schemaJoint) => {
        if (prevSchemaJoint) {
          const nodeIndex = prevSchemaJoint.node;
          const node = threeNodes[nodeIndex];
          const childIndex = schemaJoint.node;
          const child = threeNodes[childIndex];
          const setting = {
            hitRadius: prevSchemaJoint.hitRadius,
            dragForce: prevSchemaJoint.dragForce,
            gravityPower: prevSchemaJoint.gravityPower,
            stiffness: prevSchemaJoint.stiffness,
            gravityDir: prevSchemaJoint.gravityDir != null ? new THREE39.Vector3().fromArray(prevSchemaJoint.gravityDir) : undefined
          };
          const joint = this._importJoint(node, child, setting, colliderGroupsForSpring);
          if (center) {
            joint.center = center;
          }
          manager.addJoint(joint);
        }
        prevSchemaJoint = schemaJoint;
      });
    });
    manager.setInitState();
    return manager;
  }
  async _v0Import(gltf) {
    const json = gltf.parser.json;
    const isVRMUsed = json.extensionsUsed?.indexOf("VRM") !== -1;
    if (!isVRMUsed) {
      return null;
    }
    const extension = json.extensions?.["VRM"];
    const schemaSecondaryAnimation = extension?.secondaryAnimation;
    if (!schemaSecondaryAnimation) {
      return null;
    }
    const schemaBoneGroups = schemaSecondaryAnimation?.boneGroups;
    if (!schemaBoneGroups) {
      return null;
    }
    const manager = new VRMSpringBoneManager;
    const threeNodes = await gltf.parser.getDependencies("node");
    const colliderGroups = schemaSecondaryAnimation.colliderGroups?.map((schemaColliderGroup) => {
      const node = threeNodes[schemaColliderGroup.node];
      const colliders = (schemaColliderGroup.colliders ?? []).map((schemaCollider, iCollider) => {
        const offset = new THREE39.Vector3(0, 0, 0);
        if (schemaCollider.offset) {
          offset.set(schemaCollider.offset.x ?? 0, schemaCollider.offset.y ?? 0, schemaCollider.offset.z ? -schemaCollider.offset.z : 0);
        }
        return this._importSphereCollider(node, {
          offset,
          radius: schemaCollider.radius ?? 0
        });
      });
      return { colliders };
    });
    schemaBoneGroups?.forEach((schemaBoneGroup, iBoneGroup) => {
      const rootIndices = schemaBoneGroup.bones;
      if (!rootIndices) {
        return;
      }
      rootIndices.forEach((rootIndex) => {
        const root = threeNodes[rootIndex];
        const gravityDir = new THREE39.Vector3;
        if (schemaBoneGroup.gravityDir) {
          gravityDir.set(schemaBoneGroup.gravityDir.x ?? 0, schemaBoneGroup.gravityDir.y ?? 0, schemaBoneGroup.gravityDir.z ?? 0);
        } else {
          gravityDir.set(0, -1, 0);
        }
        const center = schemaBoneGroup.center != null ? threeNodes[schemaBoneGroup.center] : undefined;
        const setting = {
          hitRadius: schemaBoneGroup.hitRadius,
          dragForce: schemaBoneGroup.dragForce,
          gravityPower: schemaBoneGroup.gravityPower,
          stiffness: schemaBoneGroup.stiffiness,
          gravityDir
        };
        const colliderGroupsForSpring = schemaBoneGroup.colliderGroups?.map((iColliderGroup) => {
          const group = colliderGroups?.[iColliderGroup];
          if (group == null) {
            throw new Error(`VRMSpringBoneLoaderPlugin: The spring #${iBoneGroup} attempted to use a colliderGroup ${iColliderGroup} but not found`);
          }
          return group;
        });
        root.traverse((node) => {
          const child = node.children[0] ?? null;
          const joint = this._importJoint(node, child, setting, colliderGroupsForSpring);
          if (center) {
            joint.center = center;
          }
          manager.addJoint(joint);
        });
      });
    });
    gltf.scene.updateMatrixWorld();
    manager.setInitState();
    return manager;
  }
  _importJoint(node, child, setting, colliderGroupsForSpring) {
    const springBone = new VRMSpringBoneJoint(node, child, setting, colliderGroupsForSpring);
    if (this.jointHelperRoot) {
      const helper = new VRMSpringBoneJointHelper(springBone);
      this.jointHelperRoot.add(helper);
      helper.renderOrder = this.jointHelperRoot.renderOrder;
    }
    return springBone;
  }
  _importSphereCollider(destination, params) {
    const { offset, radius } = params;
    const shape = new VRMSpringBoneColliderShapeSphere({ offset, radius });
    const collider = new VRMSpringBoneCollider(shape);
    destination.add(collider);
    if (this.colliderHelperRoot) {
      const helper = new VRMSpringBoneColliderHelper(collider);
      this.colliderHelperRoot.add(helper);
      helper.renderOrder = this.colliderHelperRoot.renderOrder;
    }
    return collider;
  }
  _importCapsuleCollider(destination, params) {
    const { offset, radius, tail } = params;
    const shape = new VRMSpringBoneColliderShapeCapsule({ offset, radius, tail });
    const collider = new VRMSpringBoneCollider(shape);
    destination.add(collider);
    if (this.colliderHelperRoot) {
      const helper = new VRMSpringBoneColliderHelper(collider);
      this.colliderHelperRoot.add(helper);
      helper.renderOrder = this.colliderHelperRoot.renderOrder;
    }
    return collider;
  }
}
// packages/three-vrm/src/VRMLoaderPlugin.ts
class VRMLoaderPlugin {
  parser;
  expressionPlugin;
  firstPersonPlugin;
  humanoidPlugin;
  lookAtPlugin;
  metaPlugin;
  mtoonMaterialPlugin;
  materialsHDREmissiveMultiplierPlugin;
  materialsV0CompatPlugin;
  springBonePlugin;
  nodeConstraintPlugin;
  get name() {
    return "VRMLoaderPlugin";
  }
  constructor(parser, options) {
    this.parser = parser;
    const helperRoot = options?.helperRoot;
    const autoUpdateHumanBones = options?.autoUpdateHumanBones;
    this.expressionPlugin = options?.expressionPlugin ?? new VRMExpressionLoaderPlugin(parser);
    this.firstPersonPlugin = options?.firstPersonPlugin ?? new VRMFirstPersonLoaderPlugin(parser);
    this.humanoidPlugin = options?.humanoidPlugin ?? new VRMHumanoidLoaderPlugin(parser, {
      helperRoot,
      autoUpdateHumanBones
    });
    this.lookAtPlugin = options?.lookAtPlugin ?? new VRMLookAtLoaderPlugin(parser, { helperRoot });
    this.metaPlugin = options?.metaPlugin ?? new VRMMetaLoaderPlugin(parser);
    this.mtoonMaterialPlugin = options?.mtoonMaterialPlugin ?? new MToonMaterialLoaderPlugin(parser);
    this.materialsHDREmissiveMultiplierPlugin = options?.materialsHDREmissiveMultiplierPlugin ?? new VRMMaterialsHDREmissiveMultiplierLoaderPlugin(parser);
    this.materialsV0CompatPlugin = options?.materialsV0CompatPlugin ?? new VRMMaterialsV0CompatPlugin(parser);
    this.springBonePlugin = options?.springBonePlugin ?? new VRMSpringBoneLoaderPlugin(parser, {
      colliderHelperRoot: helperRoot,
      jointHelperRoot: helperRoot
    });
    this.nodeConstraintPlugin = options?.nodeConstraintPlugin ?? new VRMNodeConstraintLoaderPlugin(parser, { helperRoot });
  }
  async beforeRoot() {
    await this.materialsV0CompatPlugin.beforeRoot();
    await this.mtoonMaterialPlugin.beforeRoot();
  }
  async loadMesh(meshIndex) {
    return await this.mtoonMaterialPlugin.loadMesh(meshIndex);
  }
  getMaterialType(materialIndex) {
    const mtoonType = this.mtoonMaterialPlugin.getMaterialType(materialIndex);
    if (mtoonType != null) {
      return mtoonType;
    }
    return null;
  }
  async extendMaterialParams(materialIndex, materialParams) {
    await this.materialsHDREmissiveMultiplierPlugin.extendMaterialParams(materialIndex, materialParams);
    await this.mtoonMaterialPlugin.extendMaterialParams(materialIndex, materialParams);
  }
  async afterRoot(gltf) {
    await this.metaPlugin.afterRoot(gltf);
    await this.humanoidPlugin.afterRoot(gltf);
    await this.expressionPlugin.afterRoot(gltf);
    await this.lookAtPlugin.afterRoot(gltf);
    await this.firstPersonPlugin.afterRoot(gltf);
    await this.springBonePlugin.afterRoot(gltf);
    await this.nodeConstraintPlugin.afterRoot(gltf);
    await this.mtoonMaterialPlugin.afterRoot(gltf);
    const meta = gltf.userData.vrmMeta;
    const humanoid = gltf.userData.vrmHumanoid;
    if (meta && humanoid) {
      const vrm = new VRM({
        scene: gltf.scene,
        expressionManager: gltf.userData.vrmExpressionManager,
        firstPerson: gltf.userData.vrmFirstPerson,
        humanoid,
        lookAt: gltf.userData.vrmLookAt,
        meta,
        materials: gltf.userData.vrmMToonMaterials,
        springBoneManager: gltf.userData.vrmSpringBoneManager,
        nodeConstraintManager: gltf.userData.vrmNodeConstraintManager
      });
      gltf.userData.vrm = vrm;
    }
  }
}
// packages/three-vrm/src/VRMUtils/deepDispose.ts
function disposeMaterial(material) {
  Object.values(material).forEach((value) => {
    if (value?.isTexture) {
      const texture = value;
      texture.dispose();
    }
  });
  if (material.isShaderMaterial) {
    const uniforms = material.uniforms;
    if (uniforms) {
      Object.values(uniforms).forEach((uniform) => {
        const value = uniform.value;
        if (value?.isTexture) {
          const texture = value;
          texture.dispose();
        }
      });
    }
  }
  material.dispose();
}
function dispose(object3D) {
  const geometry = object3D.geometry;
  if (geometry) {
    geometry.dispose();
  }
  const skeleton = object3D.skeleton;
  if (skeleton) {
    skeleton.dispose();
  }
  const material = object3D.material;
  if (material) {
    if (Array.isArray(material)) {
      material.forEach((material) => disposeMaterial(material));
    } else if (material) {
      disposeMaterial(material);
    }
  }
}
function deepDispose(object3D) {
  object3D.traverse(dispose);
}

// packages/three-vrm/src/VRMUtils/removeUnnecessaryJoints.ts
import * as THREE40 from "three";
function removeUnnecessaryJoints(root, options) {
  const experimentalSameBoneCounts = options?.experimentalSameBoneCounts ?? false;
  const skinnedMeshes = [];
  root.traverse((obj) => {
    if (obj.type !== "SkinnedMesh") {
      return;
    }
    skinnedMeshes.push(obj);
  });
  const bonesList = new Map;
  let maxBones = 0;
  for (const mesh of skinnedMeshes) {
    const geometry = mesh.geometry;
    const attribute = geometry.getAttribute("skinIndex");
    const bones = [];
    const boneInverses = [];
    const boneIndexMap = {};
    const array = attribute.array;
    for (let i = 0;i < array.length; i++) {
      const index = array[i];
      if (boneIndexMap[index] == null) {
        boneIndexMap[index] = bones.length;
        bones.push(mesh.skeleton.bones[index]);
        boneInverses.push(mesh.skeleton.boneInverses[index]);
      }
      array[i] = boneIndexMap[index];
    }
    attribute.copyArray(array);
    attribute.needsUpdate = true;
    bonesList.set(mesh, { bones, boneInverses });
    maxBones = Math.max(maxBones, bones.length);
  }
  for (const mesh of skinnedMeshes) {
    const { bones, boneInverses } = bonesList.get(mesh);
    if (experimentalSameBoneCounts) {
      for (let i = bones.length;i < maxBones; i++) {
        bones[i] = bones[0];
        boneInverses[i] = boneInverses[0];
      }
    }
    const skeleton = new THREE40.Skeleton(bones, boneInverses);
    mesh.bind(skeleton, new THREE40.Matrix4);
  }
}

// packages/three-vrm/src/VRMUtils/removeUnnecessaryVertices.ts
import * as THREE41 from "three";
import { BufferAttribute as BufferAttribute7 } from "three";
function removeUnnecessaryVertices(root) {
  const geometryMap = new Map;
  root.traverse((obj) => {
    if (!obj.isMesh) {
      return;
    }
    const mesh = obj;
    const geometry = mesh.geometry;
    const origianlIndex = geometry.index;
    if (origianlIndex == null) {
      return;
    }
    const newGeometryAlreadyExisted = geometryMap.get(geometry);
    if (newGeometryAlreadyExisted != null) {
      mesh.geometry = newGeometryAlreadyExisted;
      return;
    }
    const newGeometry = new THREE41.BufferGeometry;
    newGeometry.name = geometry.name;
    newGeometry.morphTargetsRelative = geometry.morphTargetsRelative;
    geometry.groups.forEach((group) => {
      newGeometry.addGroup(group.start, group.count, group.materialIndex);
    });
    newGeometry.boundingBox = geometry.boundingBox?.clone() ?? null;
    newGeometry.boundingSphere = geometry.boundingSphere?.clone() ?? null;
    newGeometry.setDrawRange(geometry.drawRange.start, geometry.drawRange.count);
    newGeometry.userData = geometry.userData;
    geometryMap.set(geometry, newGeometry);
    const originalIndexNewIndexMap = [];
    const newIndexOriginalIndexMap = [];
    {
      const originalIndexArray = origianlIndex.array;
      const newIndexArray = new originalIndexArray.constructor(originalIndexArray.length);
      let indexHead = 0;
      for (let i = 0;i < originalIndexArray.length; i++) {
        const originalIndex = originalIndexArray[i];
        let newIndex = originalIndexNewIndexMap[originalIndex];
        if (newIndex == null) {
          originalIndexNewIndexMap[originalIndex] = indexHead;
          newIndexOriginalIndexMap[indexHead] = originalIndex;
          newIndex = indexHead;
          indexHead++;
        }
        newIndexArray[i] = newIndex;
      }
      newGeometry.setIndex(new BufferAttribute7(newIndexArray, 1, false));
    }
    Object.keys(geometry.attributes).forEach((attributeName) => {
      const originalAttribute = geometry.attributes[attributeName];
      if (originalAttribute.isInterleavedBufferAttribute) {
        throw new Error("removeUnnecessaryVertices: InterleavedBufferAttribute is not supported");
      }
      const originalAttributeArray = originalAttribute.array;
      const { itemSize, normalized } = originalAttribute;
      const newAttributeArray = new originalAttributeArray.constructor(newIndexOriginalIndexMap.length * itemSize);
      newIndexOriginalIndexMap.forEach((originalIndex, i) => {
        for (let j = 0;j < itemSize; j++) {
          newAttributeArray[i * itemSize + j] = originalAttributeArray[originalIndex * itemSize + j];
        }
      });
      newGeometry.setAttribute(attributeName, new BufferAttribute7(newAttributeArray, itemSize, normalized));
    });
    let isNullMorph = true;
    Object.keys(geometry.morphAttributes).forEach((attributeName) => {
      newGeometry.morphAttributes[attributeName] = [];
      const morphs = geometry.morphAttributes[attributeName];
      for (let iMorph = 0;iMorph < morphs.length; iMorph++) {
        const originalAttribute = morphs[iMorph];
        if (originalAttribute.isInterleavedBufferAttribute) {
          throw new Error("removeUnnecessaryVertices: InterleavedBufferAttribute is not supported");
        }
        const originalAttributeArray = originalAttribute.array;
        const { itemSize, normalized } = originalAttribute;
        const newAttributeArray = new originalAttributeArray.constructor(newIndexOriginalIndexMap.length * itemSize);
        newIndexOriginalIndexMap.forEach((originalIndex, i) => {
          for (let j = 0;j < itemSize; j++) {
            newAttributeArray[i * itemSize + j] = originalAttributeArray[originalIndex * itemSize + j];
          }
        });
        isNullMorph = isNullMorph && newAttributeArray.every((v) => v === 0);
        newGeometry.morphAttributes[attributeName][iMorph] = new BufferAttribute7(newAttributeArray, itemSize, normalized);
      }
    });
    if (isNullMorph) {
      newGeometry.morphAttributes = {};
    }
    mesh.geometry = newGeometry;
  });
  Array.from(geometryMap.keys()).forEach((originalGeometry) => {
    originalGeometry.dispose();
  });
}

// packages/three-vrm/src/VRMUtils/rotateVRM0.ts
function rotateVRM0(vrm) {
  if (vrm.meta?.metaVersion === "0") {
    vrm.scene.rotation.y = Math.PI;
  }
}

// packages/three-vrm/src/VRMUtils/index.ts
class VRMUtils {
  constructor() {}
  static deepDispose = deepDispose;
  static removeUnnecessaryJoints = removeUnnecessaryJoints;
  static removeUnnecessaryVertices = removeUnnecessaryVertices;
  static rotateVRM0 = rotateVRM0;
}
export {
  MToonMaterial,
  MToonMaterialDebugMode,
  MToonMaterialLoaderPlugin,
  MToonMaterialOutlineWidthMode,
  VRM,
  VRMAimConstraint,
  VRMCore,
  VRMCoreLoaderPlugin,
  VRMExpression,
  VRMExpressionLoaderPlugin,
  VRMExpressionManager,
  VRMExpressionMaterialColorBind,
  VRMExpressionMaterialColorType,
  VRMExpressionMorphTargetBind,
  VRMExpressionOverrideType,
  VRMExpressionPresetName,
  VRMExpressionTextureTransformBind,
  VRMFirstPerson,
  VRMFirstPersonLoaderPlugin,
  VRMFirstPersonMeshAnnotationType,
  VRMHumanBoneList,
  VRMHumanBoneName,
  VRMHumanBoneParentMap,
  VRMHumanoid,
  VRMHumanoidHelper,
  VRMHumanoidLoaderPlugin,
  VRMLoaderPlugin,
  VRMLookAt,
  VRMLookAtBoneApplier,
  VRMLookAtExpressionApplier,
  VRMLookAtHelper,
  VRMLookAtLoaderPlugin,
  VRMLookAtRangeMap,
  VRMLookAtTypeName,
  VRMMetaLoaderPlugin,
  VRMNodeConstraint,
  VRMNodeConstraintHelper,
  VRMNodeConstraintLoaderPlugin,
  VRMNodeConstraintManager,
  VRMRequiredHumanBoneName,
  VRMRollConstraint,
  VRMRotationConstraint,
  VRMSpringBoneCollider,
  VRMSpringBoneColliderHelper,
  VRMSpringBoneColliderShape,
  VRMSpringBoneColliderShapeCapsule,
  VRMSpringBoneColliderShapeSphere,
  VRMSpringBoneJoint,
  VRMSpringBoneJointHelper,
  VRMSpringBoneLoaderPlugin,
  VRMSpringBoneManager,
  VRMUtils
};
