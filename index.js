import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// 场景、相机、渲染器
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// 添加 Sky
const sky = new Sky();
sky.scale.setScalar(10000);
scene.add(sky);
const sun = new THREE.Vector3();
const skyUniforms = sky.material.uniforms;
skyUniforms['turbidity'].value = 1;
skyUniforms['rayleigh'].value = 4;
skyUniforms['mieCoefficient'].value = 0.0005;
skyUniforms['mieDirectionalG'].value = 0.7;
const phi = 0.1;
const theta = 0;
sun.setFromSphericalCoords(1, phi, theta);
skyUniforms['sunPosition'].value.copy(sun);

// 加载地面贴图
const textureLoader = new THREE.TextureLoader();
const diffMap = textureLoader.load('rocky_terrain_diff_4k.jpg'); // 漫反射颜色
const aoMap = textureLoader.load('rocky_terrain_ao_4k.jpg');     // 环境光遮蔽
const armMap = textureLoader.load('rocky_terrain_arm_4k.jpg');   // AO + Roughness + Metallic
const dispMap = textureLoader.load('rocky_terrain_disp_4k.jpg'); // 位移贴图
diffMap.wrapS = diffMap.wrapT = THREE.RepeatWrapping;
aoMap.wrapS = aoMap.wrapT = THREE.RepeatWrapping;
armMap.wrapS = armMap.wrapT = THREE.RepeatWrapping;
dispMap.wrapS = dispMap.wrapT = THREE.RepeatWrapping;
diffMap.repeat.set(200, 200);
aoMap.repeat.set(200, 200);
armMap.repeat.set(200, 200);
dispMap.repeat.set(200, 200);

// 添加地面
const groundGeometry = new THREE.PlaneGeometry(20000, 20000, 64, 64);
const groundMaterial = new THREE.MeshStandardMaterial({
    map: diffMap,
    aoMap: aoMap,
    roughnessMap: armMap,
    metalnessMap: armMap,
    displacementMap: dispMap,
    displacementScale: 0.5,
    roughness: 1.0,
    metalness: 0.0
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1;
ground.receiveShadow = true;
groundGeometry.setAttribute('uv2', new THREE.BufferAttribute(groundGeometry.attributes.uv.array, 2));
scene.add(ground);

// 灯光
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.copy(sun);
directionalLight.castShadow = true;
directionalLight.shadow.camera.far = 100;
directionalLight.shadow.camera.left = -50;
directionalLight.shadow.camera.right = 50;
directionalLight.shadow.camera.top = 50;
directionalLight.shadow.camera.bottom = -50;
directionalLight.shadow.mapSize.width = 4096;
directionalLight.shadow.mapSize.height = 4096;
scene.add(directionalLight);
const gltfLoader = new GLTFLoader();
let originalModel;
let modelBoundingBoxes = []; // 存储多个网格的边界框
gltfLoader.load(
    'model.glb',
    (gltf) => {
        originalModel = gltf.scene;
        scene.add(originalModel);
        originalModel.scale.set(1, 1, 1);
        originalModel.position.set(0, 0, 0);
        originalModel.traverse((object) => {
            if (object.isMesh) {
                object.castShadow = true;
                object.receiveShadow = true;
                // 为每个网格生成边界框
                const box = new THREE.Box3().setFromObject(object);
                modelBoundingBoxes.push(box);
                // 可视化每个网格的边界框
                const boxHelper = new THREE.Box3Helper(box, 0xff0000);
                scene.add(boxHelper);
            }
        });
        console.log('Model Bounding Boxes:', modelBoundingBoxes);
    }
);

// 加载小人模型和动画
const fbxLoader = new FBXLoader();
let character, mixer;
let actions = {};
let activeAction;
let isMoving = false;
const moveSpeed = 0.03;
let isSitting = false;
let isActionPlaying = false;

fbxLoader.load('character_stand.fbx', (fbx) => {
    character = fbx;
    scene.add(character);
    character.scale.set(0.01, 0.01, 0.01);
    character.position.set(0.8, 0.1, 0.2); // 初始位置
    character.traverse((object) => {
        if (object.isMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
        }
    });

    mixer = new THREE.AnimationMixer(character);
    actions['stand'] = mixer.clipAction(fbx.animations[0]);
    actions['stand'].play();
    activeAction = actions['stand'];

    // 加载其他动画
    const animationFiles = [
        { name: 'seat', file: 'character_seat.fbx' },
        { name: 'standToSeat', file: 'character_stand_to_seat.fbx' },
        { name: 'kick', file: 'character_kick.fbx' },
        { name: 'jump', file: 'character_jump.fbx' },
        { name: 'walking', file: 'character_walking.fbx' },
        { name: 'collision', file: 'character_collision.fbx' }
    ];

    animationFiles.forEach(({ name, file }) => {
        fbxLoader.load(file, (animFbx) => {
            const clip = animFbx.animations[0];
            if (name === 'walking') {
                clip.tracks = clip.tracks.filter(track => !track.name.includes('.position'));
            }
            actions[name] = mixer.clipAction(clip);
            if (name === 'kick' || name === 'jump' || name === 'collision' || name === 'standToSeat') {
                actions[name].loop = THREE.LoopOnce;
                actions[name].clampWhenFinished = true;
            }
            console.log(`Loaded animation: ${name}`);
        });
    });

    // 可视化角色边界框
    const characterBox = new THREE.Box3().setFromObject(character);
    const characterBoxHelper = new THREE.Box3Helper(characterBox, 0x00ff00);
    scene.add(characterBoxHelper);
});

// 相机和控制器
camera.position.set(0, 5, 10);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0, 0);
controls.maxDistance = 500;

// 键盘控制
const keys = { w: false, a: false, s: false, d: false, c: false, k: false, j: false };
window.addEventListener('keydown', (event) => {
    switch (event.key) {
        case 'w': keys.w = true; break;
        case 'a': keys.a = true; break;
        case 's': keys.s = true; break;
        case 'd': keys.d = true; break;
        case 'c': keys.c = true; break;
        case 'k': keys.k = true; break;
        case 'j': keys.j = true; break;
    }
});
window.addEventListener('keyup', (event) => {
    switch (event.key) {
        case 'w': keys.w = false; break;
        case 'a': keys.a = false; break;
        case 's': keys.s = false; break;
        case 'd': keys.d = false; break;
        case 'c': keys.c = false; break;
        case 'k': keys.k = false; break;
        case 'j': keys.j = false; break;
    }
});

// 切换动画函数
function setAction(toAction, reverse = false, nextAction = null) {
    if (toAction && toAction !== activeAction) {
        activeAction.fadeOut(0.2);
        toAction.reset();
        if (reverse) {
            toAction.timeScale = -1;
            toAction.time = toAction.getClip().duration;
        } else {
            toAction.timeScale = 1;
            toAction.time = 0;
        }
        toAction.fadeIn(0.2).play();
        activeAction = toAction;
        if (toAction.loop === THREE.LoopOnce) {
            isActionPlaying = true;
            mixer.addEventListener('finished', (event) => onActionFinished(event, nextAction));
        }
    }
}

// 动画结束时切换到下一动作
function onActionFinished(event, nextAction) {
    if (event.action === activeAction) {
        isActionPlaying = false;
        if (nextAction) {
            setAction(nextAction);
        } else {
            setAction(actions['stand']);
        }
        mixer.removeEventListener('finished', onActionFinished);
    }
}

// 碰撞检测函数（检测内部多个网格）
function checkCollision() {
    if (!character || modelBoundingBoxes.length === 0) return false;
    const characterBox = new THREE.Box3().setFromObject(character);
    characterBox.expandByScalar(-0.05); // 缩小角色边界框
    for (const box of modelBoundingBoxes) {
        if (characterBox.intersectsBox(box)) {
            return true;
        }
    }
    return false;
}

// 时钟用于动画更新
const clock = new THREE.Clock();

// 动画循环
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (character && Object.keys(actions).length === 7) {
        isMoving = false;
        let moveDirection = new THREE.Vector3();

        // WASD 移动和朝向
        if (keys.w) moveDirection.z -= 1;
        if (keys.s) moveDirection.z += 1;
        if (keys.a) moveDirection.x -= 1;
        if (keys.d) moveDirection.x += 1;

        if (moveDirection.length() > 0 && !isSitting && !isActionPlaying) {
            isMoving = true;
            moveDirection.normalize();
            const newPosition = character.position.clone().add(moveDirection.multiplyScalar(moveSpeed));
            character.position.copy(newPosition);
            character.rotation.y = Math.atan2(moveDirection.x, moveDirection.z);

            // 碰撞检测
            if (checkCollision()) {
                character.position.sub(moveDirection.multiplyScalar(moveSpeed)); // 退回
                setAction(actions['collision'], false, actions['stand']);
                isMoving = false;
            } else {
                setAction(actions['walking']);
            }
        } else if (!isSitting && !isActionPlaying) {
            setAction(actions['stand']);
        }

        // 坐下/站起 (C 键)
        if (keys.c && !isMoving && !isActionPlaying) {
            if (isSitting) {
                setAction(actions['standToSeat'], false, actions['stand']); // 坐下到站起
                isSitting = false;
            } else {
                setAction(actions['standToSeat'], true, actions['seat']); // 站起到坐下
                isSitting = true;
            }
            keys.c = false;
        }

        // 踢腿 (K 键)
        if (keys.k && !isMoving && !isSitting && !isActionPlaying) {
            setAction(actions['kick'], false, actions['stand']);
            keys.k = false;
        }

        // 跳跃 (J 键)
        if (keys.j && !isMoving && !isSitting && !isActionPlaying) {
            setAction(actions['jump'], false, actions['stand']);
            keys.j = false;
        }

        // 更新动画
        if (mixer) mixer.update(delta);
    }

    controls.update();
    renderer.render(scene, camera);
}
animate();

// 窗口调整
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});