import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { TextureLoader } from "three";

const BASE_URL = "";
const Y_OFFSET = -1;
const TOTAL_FILE_LIMIT = 150;
const COSTUMES = await (await fetch(BASE_URL + "/api/models")).json(); // array of Costume
const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;
const MAX_LOADED = IS_TOUCH ? 1 : 3;
const canvas = document.getElementById("model-canvas");
const RENDERER = new THREE.WebGLRenderer({
  antialias: true,
  canvas,
  alpha: false,
});
let width = canvas.clientWidth;
let height = canvas.clientHeight;
const SCREEN = document.getElementById("screen");
const CAMERA = new THREE.PerspectiveCamera(65, width / height, 0.01, 100);
const SCENE = new THREE.Scene();
const GLTF_LOADER = new GLTFLoader();
const COSTUME_UPLOAD_FORM = document.forms.costumeUploadForm;
let loadedCostumes = new Array(); // [{costume, partMeshes[]}]
let activeParts = new Array();
let activeCostume; // LoadedCostume
let rightMenuSelected = 0;

let closeLeft, closeRight;
let closeRightMenuOnContribute = false;
let prevResolutionIsSmall = false;

setupRenderer();
setAboutButtons();
setupCamera();
// need to setup camera before defining controls
const CONTROLS = new OrbitControls(CAMERA, RENDERER.domElement);
setupControls();
setupFlatColorBG();
setupRightMenuTopButtons();
adaptToScreenResolution(true);
setupForm();
resetForm();
window.onresize = () => {
  adaptToScreenResolution();
};
animate();

// place first costume
if (COSTUMES.length > 0) {
  await replaceRenderedCostume(GLTF_LOADER, COSTUMES[0]);
}

function Costume(costumeID, name, description, parts, images) {
  this.costumeID = costumeID;
  this.name = name;
  this.description = description;
  this.parts = parts;
  this.images = images;
}

function Part(name, path) {
  this.name = name;
  this.path = path;
}

function LoadedCostume(costume, partMeshes) {
  this.costume = costume;
  this.partMeshes = partMeshes;
}

function Image(name, path) {
  this.name = name;
  this.path = path;
}

function animate(t = 0) {
  requestAnimationFrame(animate);

  RENDERER.render(SCENE, CAMERA);
  CONTROLS.update();
}

function setupRenderer() {
  RENDERER.setSize(width, height, false);
  RENDERER.outputColorSpace = THREE.SRGBColorSpace;

  SCREEN.appendChild(RENDERER.domElement);
  document.body.appendChild(SCREEN);

  window.addEventListener("resize", () => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;

    CAMERA.aspect = width / height;
    CAMERA.updateProjectionMatrix();

    RENDERER.setSize(width, height, false);
  });
}

function setupCamera() {
  CAMERA.position.x = 0;
  CAMERA.position.y = 0;
  CAMERA.position.z = 2;

  document.getElementById("reset-camera").onclick = () => {
    resetCamera();
  };
}

function setupControls() {
  CONTROLS.enablePan = true;
  CONTROLS.enableDamping = true;
  CONTROLS.dampingFactor = 0.1;
}

function setupFlatColorBG() {
  const SPHERE_GEOMETRY = new THREE.SphereGeometry(50, 64, 64);

  const SPHERE_MATERIAL = new THREE.MeshBasicMaterial({
    side: THREE.BackSide,
    color: new THREE.Color(10 / 255, 40 / 255, 7 / 255),
  });

  SCENE.add(new THREE.Mesh(SPHERE_GEOMETRY, SPHERE_MATERIAL));
}

async function setupImageBG() {
  const SPHERE_TEXTURE = await new THREE.TextureLoader().loadAsync(
    "/textures/hdri_final-75b.jpg",
  );
  SPHERE_TEXTURE.colorSpace = THREE.SRGBColorSpace;
  const SPHERE_GEOMETRY = new THREE.SphereGeometry(50, 64, 64);

  const SPHERE_MATERIAL = new THREE.MeshBasicMaterial({
    map: SPHERE_TEXTURE,
    side: THREE.BackSide,
    color: new THREE.Color(0.8, 0.8, 0.8),
  });

  const SKY_SPHERE = new THREE.Mesh(SPHERE_GEOMETRY, SPHERE_MATERIAL);

  // fix skysphere rotation
  SKY_SPHERE.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0.03);
  SKY_SPHERE.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.PI * 0.5);

  SCENE.add(SKY_SPHERE);
}

function setupRightMenuTopButtons() {
  let rightMenuList = document.getElementById("right-menu__top__content");

  document.getElementById("images-button").onclick = () => {
    displayImagesInRightMenu(rightMenuList, activeCostume.costume);
  };
  document.getElementById("parts-button").onclick = () => {
    displayPartToggles(rightMenuList, activeCostume.costume);
  };
  document.getElementById("costumes-button").onclick = () => {
    displayModelSelectButtons(rightMenuList, GLTF_LOADER);
  };
}

function setupForm() {
  document.getElementById("contribute").addEventListener(
    "click",
    () => {
      showElem(COSTUME_UPLOAD_FORM);
    },
    false,
  );
  setupFormClose();

  document.getElementById("preview").onclick = () => {
    previewFormModel();
  };
  document.getElementById("reset-form").onclick = () => {
    resetForm();
  };

  document
    .getElementById("images")
    .addEventListener("change", generateImageNameInputGrid);
  document
    .getElementById("parts")
    .addEventListener("change", generateModelNameInputGrid);
  COSTUME_UPLOAD_FORM.addEventListener("submit", async (e) => {
    submitForm(e);
  });
}

async function replaceRenderedCostume(loader, costume) {
  console.log("Replacing to " + costume.costumeID);

  let newCostumeID = costume.costumeID;

  if (
    activeCostume &&
    (!activeCostume.costume || newCostumeID != activeCostume.costume.costumeID)
  ) {
    removeCostumeFromScene(activeCostume, activeParts);
  }

  if (
    loadedCostumes.length == 0 ||
    !activeCostume ||
    !activeCostume.costume ||
    newCostumeID != activeCostume.costume.costumeID
  ) {
    let costumeToPlace;
    if (
      !loadedCostumes.some(
        (e) => e.costume && e.costume.costumeID === newCostumeID,
      )
    ) {
      console.log("Costume " + newCostumeID + " not loaded, trying to load.");

      let loadingIcon = displayLoadingIcon();
      let loadedCostume = await loadCostumeFromDB(loader, costume);
      loadingIcon.remove();

      if (loadedCostumes.length >= MAX_LOADED) {
        disposeOldestCostumeFromMemory(loadedCostumes);
      }

      loadedCostumes.push(loadedCostume);
      costumeToPlace = loadedCostume;
      console.log("Costume " + newCostumeID + " successfully loaded");
    } else {
      costumeToPlace = loadedCostumes.find(
        (e) => e.costume.costumeID === newCostumeID,
      );
    }
    placeCostumeToScene(costumeToPlace);
    activeParts = new Array(costumeToPlace.partMeshes.length).fill(true);
    activeCostume = costumeToPlace;
  }

  updateMenusInfo(costume);
}

function updateMenusInfo(costume) {
  setCostumeNameAndDescription(costume.name, costume.description);
  updateRightMenu(costume);
}

function updateRightMenu(costume) {
  let rightMenuList = document.getElementById("right-menu__top__content");
  if (rightMenuSelected == 0) {
    displayImagesInRightMenu(rightMenuList, costume);
  } else if (rightMenuSelected == 1) {
    displayPartToggles(rightMenuList, costume);
  }
}

async function loadCostumeFromDB(loader, costume) {
  let partMeshes = new Array();
  let part;

  for (let i = 0; i < costume.parts.length; i++) {
    part = await loader.loadAsync(BASE_URL + costume.parts[i].path);

    // turn on backfaces
    part.scene.traverse((child) => {
      if (child.isMesh) {
        child.material.side = THREE.DoubleSide;
      }
    });

    partMeshes.push(part);

    console.log("loaded " + costume.parts[i].name);
  }
  return new LoadedCostume(costume, partMeshes);
}

function placeCostumeToScene(loadedCostume) {
  for (let i = 0; i < loadedCostume.partMeshes.length; i++) {
    placeMeshToScene(loadedCostume.partMeshes[i]);
  }
}

function placeMeshToScene(mesh) {
  mesh.scene.position.y = Y_OFFSET;
  SCENE.add(mesh.scene);
}

function removeCostumeFromScene(loadedCostumeToRemove, activeParts) {
  if (activeParts.length != loadedCostumeToRemove.partMeshes.length) {
    console.log(
      "activeParts is different length than partMeshes " +
        activeParts.length +
        "," +
        loadedCostumeToRemove.partMeshes.length,
    );
  } else {
    for (let j = 0; j < activeParts.length; j++) {
      if (activeParts[j]) {
        SCENE.remove(loadedCostumeToRemove.partMeshes[j].scene);
      }
    }
  }
}

function disposeOldestCostumeFromMemory(loadedCostumes) {
  for (let i = 0; i < loadedCostumes[0].partMeshes.length; i++) {
    let gltf = loadedCostumes[0].partMeshes[i];
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry.dispose();

        if (Array.isArray(obj.material)) {
          obj.material.forEach((mat) => mat.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  loadedCostumes.shift();
}

function setCostumeNameAndDescription(name, description) {
  document.getElementsByClassName("left-menu__title")[0].textContent = name;
  document.getElementById("left-menu__description").textContent = description;
}

// show or hide a part of the costume and update its button
function toggleCostumePart(partIndex, button) {
  if (partIndex >= activeParts.length) {
    console.log("partIndex out of range");
    return -1;
  }

  if (activeParts[partIndex]) {
    SCENE.remove(activeCostume.partMeshes[partIndex].scene);
    button.className = "part-toggle-button main-font";
  } else {
    placeMeshToScene(activeCostume.partMeshes[partIndex]);
    button.className = "part-toggle-button main-font green";
  }
  activeParts[partIndex] = !activeParts[partIndex];
}

function loadImageFromDB(src, alt, imageName, imageIndex) {
  let img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.onclick = () => {
    showFullscreenImage(img, imageName, imageIndex);
  };

  return img;
}

function showFullscreenImage(img, imageName, imageIndex) {
  let next, prev, name;

  if (!document.getElementById("full-image-container")) {
    ({ next, prev, name } = createFullImageContainer(img));
  } else {
    ({ next, prev, name } = modifyFullImageContainer(imageIndex));
  }

  prev.onclick = () => {
    showFullscreenImage(
      document.getElementById("right-menu__top__content").children[
        (imageIndex - 1 + activeCostume.costume.images.length) %
          activeCostume.costume.images.length
      ],
      activeCostume.costume.images[
        (imageIndex - 1 + activeCostume.costume.images.length) %
          activeCostume.costume.images.length
      ].name,
      (imageIndex - 1 + activeCostume.costume.images.length) %
        activeCostume.costume.images.length,
    );
  };

  next.onclick = (event) => {
    showFullscreenImage(
      document.getElementById("right-menu__top__content").children[
        (imageIndex + 1) % activeCostume.costume.images.length
      ],
      activeCostume.costume.images[
        (imageIndex + 1) % activeCostume.costume.images.length
      ].name,
      (imageIndex + 1) % activeCostume.costume.images.length,
    );
  };

  name.textContent = imageName;
}

function createFullImageContainer(img) {
  let fullImageContainer = document.createElement("div");
  fullImageContainer.id = "full-image-container";
  document.getElementById("screen").appendChild(fullImageContainer);

  let closeButton = createCloseButton("25px");
  closeButton.className = "close-button full-image-container__close-button";
  fullImageContainer.appendChild(closeButton);
  closeButton.onclick = () => {
    closeElem(fullImageContainer);
  };

  let next = document.createElement("img");
  next.className = "full-image-container__button";
  next.src = "./icons/next.svg";
  next.id = "full-image-container__next";
  fullImageContainer.appendChild(next);

  let prev = document.createElement("img");
  prev.className = "full-image-container__button";
  prev.src = "./icons/prev.svg";
  prev.id = "full-image-container__prev";
  fullImageContainer.appendChild(prev);

  let name = document.createElement("div");
  name.id = "full-image-container__name";
  name.className = "title-font";
  fullImageContainer.appendChild(name);

  let fullImage = img.cloneNode(true);
  fullImage.id = "full-image-container__image";
  fullImageContainer.appendChild(fullImage);

  return {
    next: next,
    prev: prev,
    name: name,
  };
}

function modifyFullImageContainer(imageIndex) {
  let fullImageContainer = document.getElementById("full-image-container");
  let next = document.getElementById("full-image-container__next");
  let prev = document.getElementById("full-image-container__prev");
  let name = document.getElementById("full-image-container__name");
  let fullImage = document.getElementById("full-image-container__image");

  fullImage.src = activeCostume.costume.images[imageIndex].path;

  return {
    next: next,
    prev: prev,
    name: name,
  };
}

function createCloseButton(size) {
  let cross = document.createElement("img");
  cross.src = "/icons/cross.svg";
  cross.alt = "Close";
  cross.style.width = size;
  cross.style.height = size;
  cross.className = "close-button";
  cross.title = "Close";

  return cross;
}

function resetCamera() {
  CONTROLS.reset();
  CONTROLS.enablePan = true;
  CONTROLS.enableDamping = true;
  CONTROLS.dampingFactor = 0.1;
}

function setAboutButtons() {
  let closeButton = createCloseButton("20px");
  closeButton.style.gridRowStart = 1;
  closeButton.style.gridColumnStart = 2;
  let aboutContainer = document.getElementById("about-container");
  closeButton.onclick = () => {
    hideElem(aboutContainer);
  };
  aboutContainer.appendChild(closeButton);

  document.getElementById("show-about").onclick = () => {
    showElem(aboutContainer);
  };
}

function placePartToggle(index, toggleButtonsContainer, parentCostume = null) {
  let toggle = document.createElement("button");

  if (activeParts[index]) {
    toggle.className = "part-toggle-button main-font green";
  } else {
    toggle.className = "part-toggle-button main-font";
  }

  toggle.textContent = parentCostume ? parentCostume.parts[index].name : index;
  toggle.index = index;

  toggleButtonsContainer.appendChild(toggle);

  toggle.onclick = () => {
    toggleCostumePart(toggle.index, toggle);
  };
}

function displayImagesInRightMenu(rightMenuList, activeCostume) {
  rightMenuSelected = 0;
  document.getElementById("images-button").className =
    "main-font right-menu-sections-font green";
  document.getElementById("parts-button").className =
    "main-font right-menu-sections-font";
  document.getElementById("costumes-button").className =
    "main-font right-menu-sections-font";
  rightMenuList.innerHTML = "";

  for (let i = 0; i < activeCostume.images.length; i++) {
    let img = loadImageFromDB(
      BASE_URL + activeCostume.images[i].path,
      "Image Missing",
      activeCostume.images[i].name,
      i,
    );

    rightMenuList.appendChild(img);
  }
}

function displayPartToggles(togglesContainer, activeCostume) {
  rightMenuSelected = 1;
  document.getElementById("images-button").className =
    "main-font right-menu-sections-font";
  document.getElementById("parts-button").className =
    "main-font right-menu-sections-font green";
  document.getElementById("costumes-button").className =
    "main-font right-menu-sections-font";
  togglesContainer.innerHTML = "";

  if (!activeCostume) {
    for (let i = 0; i < activeParts.length; i++) {
      placePartToggle(i, togglesContainer);
    }
  } else {
    for (let i = 0; i < activeParts.length; i++) {
      placePartToggle(i, togglesContainer, activeCostume);
    }
  }
}

function displayModelSelectButtons(costumesContainer, loader) {
  rightMenuSelected = 2;
  document.getElementById("images-button").className =
    "main-font right-menu-sections-font";
  document.getElementById("parts-button").className =
    "main-font right-menu-sections-font";
  document.getElementById("costumes-button").className =
    "main-font right-menu-sections-font green";
  costumesContainer.innerHTML = "";

  for (let i = 0; i < COSTUMES.length; i++) {
    if (COSTUMES[i].images.length > 0) {
      let modelSelectCard = document.createElement("div");
      modelSelectCard.className = "model-select-card";
      costumesContainer.appendChild(modelSelectCard);

      let img = document.createElement("img");
      img.src = BASE_URL + COSTUMES[i].images[0].path;
      img.alt = "Image Missing";

      modelSelectCard.appendChild(img);
      modelSelectCard.onclick = () => {
        replaceRenderedCostume(loader, COSTUMES[i]);
      };
      placeModelSelectButtonWithImage(COSTUMES[i], modelSelectCard);
    } else {
      placeModelSelectButton(COSTUMES[i], costumesContainer, loader);
    }
  }
}

function placeModelSelectButton(costume, modelSelectorContainer, loader) {
  let select = document.createElement("button");
  select.className = "main-font medium-font";
  select.textContent = costume.name;
  select.costume = costume;

  modelSelectorContainer.appendChild(select);

  select.onclick = () => {
    replaceRenderedCostume(loader, select.costume);
  };
}

function placeModelSelectButtonWithImage(costume, modelSelectCard) {
  let select = document.createElement("button");
  select.className = "main-font medium-font";
  select.textContent = costume.name;

  modelSelectCard.appendChild(select);
}

function setupFormClose() {
  let closeButton = createCloseButton("20px");
  closeButton.onclick = () => {
    hideElem(COSTUME_UPLOAD_FORM);
  };

  document.getElementById("form__title").appendChild(closeButton);
}

// generate a grid of image+input field pair in the form for filling image names
function generateImageNameInputGrid(evt) {
  let images = evt.target.files;

  let imageNameInputGrid = document.createElement("div");
  imageNameInputGrid.className = "form__image-name-input-grid";

  for (let i = 0; i < images.length; i++) {
    let imageName = document.createElement("input");
    imageName.type = "text";
    imageName.id = "imageNames" + i;
    imageName.name = "imageNames";
    imageName.className =
      "input-text-field input-text-field--small main-font small-font";
    imageName.required = true;
    imageName.autocomplete = false;
    imageName.placeholder = "Název Obrázku";

    let imgPreview = document.createElement("img");
    imgPreview.src = URL.createObjectURL(images[i]);
    imgPreview.alt = "Image Missing";

    let imageCard = document.createElement("div");
    imageCard.className = "form__image-card";

    imageCard.appendChild(imgPreview);
    imageCard.appendChild(imageName);

    imageNameInputGrid.appendChild(imageCard);
  }

  document.getElementById("form__rows").appendChild(imageNameInputGrid);
}

// generate a grid of input field pair in the form for filling model names
function generateModelNameInputGrid(evt) {
  let parts = evt.target.files;

  let imageNameInputGrid = document.createElement("div");
  imageNameInputGrid.className = "form__image-name-input-grid";

  for (let i = 0; i < parts.length; i++) {
    let partName = document.createElement("input");
    partName.type = "text";
    partName.id = "partNames" + i;
    partName.name = "partNames";
    partName.className =
      "input-text-field input-text-field--small main-font small-font";
    partName.required = true;
    partName.autocomplete = false;
    partName.placeholder = "Název modelu " + parts[i].name;

    imageNameInputGrid.appendChild(partName);
  }

  document.getElementById("form__rows").appendChild(imageNameInputGrid);
}

async function loadCostumePreviewFromForm(loader, parts) {
  let partMeshes = new Array();

  for (let i = 0; i < parts.length; i++) {
    let part = await loader.loadAsync(URL.createObjectURL(parts[i]));

    // turn on backfaces
    part.scene.traverse((child) => {
      if (child.isMesh) {
        child.material.side = THREE.DoubleSide;
      }
    });

    partMeshes.push(part);
  }
  return new LoadedCostume(null, partMeshes);
}

async function previewFormModel() {
  parts = document.getElementById("parts").files;

  if (parts == null || parts.length == 0) return 0;

  hideElem(COSTUME_UPLOAD_FORM);

  let loading = displayLoadingIcon();

  if (activeCostume) {
    removeCostumeFromScene(activeCostume, activeParts);
  }

  let loadedCostume = await loadCostumePreviewFromForm(GLTF_LOADER, parts);

  if (loadedCostumes.length >= MAX_LOADED) {
    disposeOldestCostumeFromMemory(loadedCostumes);
  }

  loadedCostumes.push(loadedCostume);
  placeCostumeToScene(loadedCostume);
  activeCostume = loadedCostume;

  activeParts = new Array(loadedCostume.partMeshes.length).fill(true);

  if (rightMenuSelected == 1) {
    displayPartToggles(
      document.getElementById("right-menu__top__content"),
      null,
    );
  }

  loading.remove();
}

function resetForm() {
  let toReset = document.getElementsByClassName("form__image-name-input-grid");

  for (let i = toReset.length - 1; i >= 0; i--) {
    toReset[i].remove();
  }

  COSTUME_UPLOAD_FORM.reset();
}

async function submitForm(form) {
  form.preventDefault();
  hideElem(COSTUME_UPLOAD_FORM);
  let loadingIcon = displayLoadingIcon();
  let successContainer = document.createElement("div");
  successContainer.className = "success-container";
  let success = document.createElement("div");
  success.className = "main-font large-font success";
  successContainer.appendChild(success);
  let fileSize = checkSubmitSize(form);

  if (fileSize > TOTAL_FILE_LIMIT) {
    loadingIcon.remove();
    success.textContent = `Dosažen limit souborů (${TOTAL_FILE_LIMIT}MB)`;
    success.style.color = "#ff2a00";
    document.getElementById("screen").appendChild(successContainer);

    setTimeout(function () {
      successContainer.remove();
    }, 4000);

    return -1;
  } else {
    const FORM_DATA = new FormData(form.target);

    const RES = await fetch(BASE_URL + "/api/uploadObject", {
      method: "POST",
      body: FORM_DATA,
    });

    const DATA = await RES.json();
    loadingIcon.remove();

    // multer error
    if (!RES.ok) {
      console.error(DATA.error);
      success.textContent = `Dosažen limit souborů (${TOTAL_FILE_LIMIT}MB)`;
      success.style.color = "#ff2a00";
      document.getElementById("screen").appendChild(successContainer);

      setTimeout(function () {
        successContainer.remove();
      }, 4000);

      return -1;
    }

    // success
    if (typeof DATA !== "undefined") {
      success.textContent = "Úspěšně nahráno";
      success.style.color = "#1aff00";
      document.getElementById("screen").appendChild(successContainer);

      setTimeout(function () {
        successContainer.remove();
        resetForm();
      }, 2000);
    }
  }
}

function checkSubmitSize(form) {
  const PART_FILES = form.target.elements["partFiles"].files;
  const IMAGES = form.target.elements["images"].files;
  let fileSize = 0;

  for (let i = 0; i < PART_FILES.length; i++) {
    fileSize += PART_FILES[i].size / 1024 / 1024;
  }
  for (let i = 0; i < IMAGES.length; i++) {
    fileSize += IMAGES[i].size / 1024 / 1024;
  }

  return fileSize;
}

function closeRightMenu() {
  let rightMenu = document.getElementById("right-menu");
  showHide("right-menu__button", "right-menu");
  rightMenu.style.zIndex = 10;
  document.getElementById("left-menu__button").style.opacity = 1;
  rightMenu.style.pointerEvents = "none";
}

function adaptToScreenResolution(force = false) {
  let leftMenu = document.getElementById("left-menu");
  let leftMenuButton = document.getElementById("left-menu__button");
  let rightMenu = document.getElementById("right-menu");
  let rightMenuButton = document.getElementById("right-menu__button");
  let form = document.getElementById("costume-form");
  let rightMenuButtons = document.getElementsByClassName(
    "right-menu__top__buttons-container",
  )[0];
  let leftMenuDescriptionContainer = document.getElementById(
    "left-menu__description-container",
  );

  if (IS_TOUCH || window.innerWidth < 1080) {
    if (!prevResolutionIsSmall) {
      console.log("changing to small");
      prevResolutionIsSmall = true;

      if (!closeLeft) {
        closeLeft = createCloseButton("18px");
        closeLeft.onclick = () => {
          showHide("left-menu__button", "left-menu");
          leftMenu.style.zIndex = 10;
          rightMenuButton.style.opacity = 1;
          leftMenu.style.pointerEvents = "none";
        };
        leftMenu.appendChild(closeLeft);
      }

      if (!closeRight) {
        closeRight = createCloseButton("18px");
        closeRight.onclick = () => {
          closeRightMenu();
        };
        rightMenuButtons.appendChild(closeRight);
      }

      if (!closeRightMenuOnContribute) {
        document
          .getElementById("contribute")
          .addEventListener("click", closeRightMenu);
        closeRightMenuOnContribute = true;
      }

      leftMenuButton.onclick = () => {
        showHide("left-menu", "left-menu__button");
        leftMenu.style.pointerEvents = "all";
        leftMenu.style.zIndex = 12;
        rightMenuButton.style.opacity = 0;
      };

      rightMenuButton.onclick = () => {
        showHide("right-menu", "right-menu__button");
        rightMenu.style.pointerEvents = "all";
        rightMenu.style.zIndex = 12;
        leftMenuButton.style.opacity = 0;
      };

      rightMenu.onmouseover = null;
      rightMenu.onmouseout = null;
      leftMenuDescriptionContainer.onmouseover = null;
      leftMenuDescriptionContainer.onmouseout = null;
      document.getElementById(
        "left-menu__description-container",
      ).style.opacity = 1;
      showElem(rightMenuButton);
      showElem(leftMenuButton);
      hideElem(leftMenu);
      hideElem(rightMenu);
    }
  } else {
    if (prevResolutionIsSmall || force) {
      console.log("changing to large");
      prevResolutionIsSmall = false;

      if (closeLeft) {
        leftMenu.removeChild(closeLeft);
        closeLeft = null;
      }
      if (closeRight) {
        rightMenuButtons.removeChild(closeRight);
        closeRight = null;
      }

      if (closeRightMenuOnContribute) {
        document
          .getElementById("contribute")
          .removeEventListener("click", closeRightMenu);
        closeRightMenuOnContribute = false;
      }

      leftMenuButton.onclick = null;
      rightMenuButton.onclick = null;
      rightMenu.onmouseover = () => {
        showHide("right-menu", "right-menu__button");
      };
      rightMenu.onmouseout = () => {
        showHide("right-menu__button", "right-menu");
      };
      rightMenu.style.pointerEvents = "all";

      leftMenuDescriptionContainer.onmouseover = () => {
        showHide("left-menu__description-container", "left-menu__button");
      };
      leftMenuDescriptionContainer.onmouseout = () => {
        showHide("left-menu__button", "left-menu__description-container");
      };
      leftMenuDescriptionContainer.style.opacity = 0;
      showElem(leftMenuButton);
      showElem(rightMenuButton);
      showElem(leftMenu);
      rightMenu.style.pointerEvents = "all";
      rightMenu.style.opacity = 0;
    }
  }
}

function displayLoadingIcon() {
  let loading = document.createElement("div");
  loading.className = "loading";

  let loadingAnim = document.createElement("div");
  loadingAnim.className = "loading-anim";

  loading.appendChild(loadingAnim);
  document.getElementById("screen").appendChild(loading);

  return loading;
}

function hideElem(element) {
  try {
    element.style.opacity = 0;
    element.style.pointerEvents = "none";
  } catch (error) {
    return -1;
  }
}

function showElem(element) {
  try {
    element.style.opacity = 1;
    element.style.pointerEvents = "all";
  } catch (error) {
    return -1;
  }
}

function showHide(show, hide) {
  document.getElementById(show).style.opacity = 1;
  document.getElementById(hide).style.opacity = 0;
}

function closeElem(element) {
  try {
    element.remove();
  } catch (error) {
    return -1;
  }
}
