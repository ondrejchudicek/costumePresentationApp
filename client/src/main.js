import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { TextureLoader } from "three";

const BASE_URL = "";
const Y_OFFSET = -1;
const TOTAL_FILE_LIMIT = 150;
const COSTUMES = await (await fetch(BASE_URL + "/api/models")).json();
const IS_TOUCH = window.matchMedia("(pointer: coarse)").matches;
const MAX_LOADED = IS_TOUCH ? 1 : 3;
const canvas = document.getElementById("model-canvas");
const RENDERER = new THREE.WebGLRenderer({
  antialias: true,
  canvas,
  alpha: false,
});
var width = canvas.clientWidth;
var height = canvas.clientHeight;
const SCREEN = document.getElementById("screen");
const CAMERA = new THREE.PerspectiveCamera(65, width / height, 0.01, 100);
const SCENE = new THREE.Scene();
const CONTROLS = new OrbitControls(CAMERA, RENDERER.domElement);
const GLTF_LOADER = new GLTFLoader();
const COSTUME_UPLOAD_FORM = document.forms.costumeUploadForm;
var loadedCostumes = new Array(); // [{id, partMeshes[]}]
var activeCostumeIndex = -1;
var activeCostumeID = -1;
var activeCostume;
var activeParts = new Array();
var rightMenuSelected = 0;

setupRenderer();
setAboutButtons();
setupCamera();
await setupBackground();
setupRightMenuTopButtons();
onResize();
setupForm();
resetForm();
animate();

// place first costume
if (COSTUMES.length > 0) {
  await replaceCostume(GLTF_LOADER, COSTUMES[0]);
}

function Costume(name, description, parts, images) {
  this.name = name;
  this.description = description;
  this.parts = parts;
  this.images = images;
}

function Part(name, path) {
  this.name = name;
  this.path = path;
}

function LoadedCostume(costumeID, partMeshes) {
  this.costumeID = costumeID;
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

  CONTROLS.enablePan = true;
  CONTROLS.enableDamping = true;
  CONTROLS.dampingFactor = 0.1;

  document.getElementById("reset-camera").onclick = () => {
    resetCamera();
  };
}

async function setupBackground() {
  const SPHERE_TEXTURE = await new THREE.TextureLoader().loadAsync(
    "/textures/hdri_final-75b.jpg",
  );
  SPHERE_TEXTURE.colorSpace = THREE.SRGBColorSpace;
  const SPHERE_GEOMETRY = new THREE.SphereGeometry(50, 64, 64);

  const SPHERE_MATERIAL = new THREE.MeshBasicMaterial({
    //map: SPHERE_TEXTURE,
    side: THREE.BackSide,
    //color: new THREE.Color(0.8, 0.8, 0.8)
    color: new THREE.Color(10 / 255, 40 / 255, 7 / 255),
  });

  // fix skysphere rotation
  const SKY_SPHERE = new THREE.Mesh(SPHERE_GEOMETRY, SPHERE_MATERIAL);
  SKY_SPHERE.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), 0.03);
  SKY_SPHERE.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.PI * 0.5);

  SCENE.add(SKY_SPHERE);
}

function setupRightMenuTopButtons() {
  let rightMenuList = document.getElementById("right-menu__top__content");

  document.getElementById("images-button").onclick = () => {
    displayImages(rightMenuList, activeCostume);
  };
  document.getElementById("parts-button").onclick = () => {
    displayPartToggles(rightMenuList, activeCostume);
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
    previewUploadModel();
  };
  document.getElementById("reset-form").onclick = () => {
    resetForm();
  };

  document.getElementById("images").addEventListener("change", getImages);
  document.getElementById("parts").addEventListener("change", getParts);
  COSTUME_UPLOAD_FORM.addEventListener("submit", async (e) => {
    submit(e);
  });
}

// removes a costume from scene and places a new one, loads it if needed, updates menus with new info
async function replaceCostume(loader, costume) {
  let costumeID = costume.costumeID;

  if (activeCostumeID != -1 && costumeID != activeCostumeID) {
    removeCostumeFromScene(getLoadedCostumeIndex(activeCostumeID), activeParts);
  }

  if (costumeID != activeCostumeID) {
    let newCostumeIndex = getLoadedCostumeIndex(costumeID);
    if (newCostumeIndex == -1) {
      console.log("Costume " + costumeID + " not loaded, trying to load.");

      let loadingIcon = displayLoadingIcon();
      let loadedCostume = await loadCostume(loader, costume);
      loadingIcon.remove();

      if (loadedCostumes.length >= MAX_LOADED) {
        disposeOldest(loadedCostumes);
      }

      loadedCostumes.push(loadedCostume);
      newCostumeIndex = loadedCostumes.length - 1;
      console.log("Costume " + costumeID + " successfully loaded");
    }

    placeCostume(loadedCostumes[newCostumeIndex]);
    activeParts = new Array(
      loadedCostumes[newCostumeIndex].partMeshes.length,
    ).fill(true);
    activeCostume = costume;
    activeCostumeID = activeCostume.costumeID;
  }

  setNameDescription(costume.name, costume.description);

  // update right display
  let rightMenuList = document.getElementById("right-menu__top__content");
  if (rightMenuSelected == 0) {
    displayImages(rightMenuList, costume);
  } else if (rightMenuSelected == 1) {
    displayPartToggles(rightMenuList, costume);
  }
}

// requests costume parts from server
async function loadCostume(loader, costume) {
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
  return new LoadedCostume(costume.costumeID, partMeshes);
}

function placeCostume(loadedCostume) {
  for (let i = 0; i < loadedCostume.partMeshes.length; i++) {
    placeMesh(loadedCostume.partMeshes[i]);
  }
}

function placeMesh(mesh) {
  mesh.scene.position.y = Y_OFFSET;
  SCENE.add(mesh.scene);
}

function removeCostumeFromScene(activeCostumeIndex, activeParts) {
  if (
    activeParts.length != loadedCostumes[activeCostumeIndex].partMeshes.length
  ) {
    console.log(
      "activeParts is different length than partMeshes " +
        activeParts.length +
        "," +
        loadedCostumes[activeCostumeIndex].partMeshes.length,
    );
  } else {
    for (let j = 0; j < activeParts.length; j++) {
      if (activeParts[j] == true) {
        SCENE.remove(loadedCostumes[activeCostumeIndex].partMeshes[j].scene);
      }
    }
  }
}

function disposeOldest(loadedCostumes) {
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

function setNameDescription(name, description) {
  document.getElementsByClassName("left-menu__title")[0].textContent = name;
  document.getElementById("left-menu__description").textContent = description;
}

// show or hide a part of the costume and update its button
function togglePart(partIndex, button) {
  if (partIndex >= activeParts.length) {
    console.log("partIndex out of range");
    return -1;
  }

  let activeCostumeIndex = getLoadedCostumeIndex(activeCostumeID);
  if (activeParts[partIndex]) {
    SCENE.remove(
      loadedCostumes[activeCostumeIndex].partMeshes[partIndex].scene,
    );
    button.className = "part-toggle-button main-font";
  } else {
    placeMesh(loadedCostumes[activeCostumeIndex].partMeshes[partIndex]);
    button.className = "part-toggle-button main-font green";
  }
  activeParts[partIndex] = !activeParts[partIndex];
}

// loads images relevant for the costume and displays in the right menu
function loadImage(src, alt, imageName, imagesContainer, imageIndex) {
  let img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.onclick = () => {
    showFullImage(img, imageName, imageIndex);
  };

  imagesContainer.appendChild(img);
}

// shows image in bigger window
function showFullImage(img, imageName, imageIndex) {
  let fullImageContainer, closeButton, next, prev, name, fullImage;

  if (!document.getElementById("full-image-container")) {
    fullImageContainer = document.createElement("div");
    fullImageContainer.id = "full-image-container";
    document.getElementById("screen").appendChild(fullImageContainer);

    closeButton = createCloseButton("35px");
    closeButton.className = "close-button full-image-container__close-button";
    fullImageContainer.appendChild(closeButton);
    closeButton.onclick = () => {
      closeElem(fullImageContainer);
    };

    next = document.createElement("img");
    next.className = "full-image-container__button";
    next.src = "./icons/next.svg";
    next.id = "full-image-container__next";
    fullImageContainer.appendChild(next);

    prev = document.createElement("img");
    prev.className = "full-image-container__button";
    prev.src = "./icons/prev.svg";
    prev.id = "full-image-container__prev";
    fullImageContainer.appendChild(prev);

    name = document.createElement("div");
    name.id = "full-image-container__name";
    name.className = "title-font";
    fullImageContainer.appendChild(name);

    fullImage = img.cloneNode(true);
    fullImage.id = "full-image-container__image";
    fullImageContainer.appendChild(fullImage);
  } else {
    fullImageContainer = document.getElementById("full-image-container");
    next = document.getElementById("full-image-container__next");
    prev = document.getElementById("full-image-container__prev");
    name = document.getElementById("full-image-container__name");
    fullImage = document.getElementById("full-image-container__image");

    fullImage.src = activeCostume.images[imageIndex].path;
  }

  prev.onclick = () => {
    showFullImage(
      document.getElementById("right-menu__top__content").children[
        (imageIndex - 1 + activeCostume.images.length) %
          activeCostume.images.length
      ],
      activeCostume.images[
        (imageIndex - 1 + activeCostume.images.length) %
          activeCostume.images.length
      ].name,
      (imageIndex - 1 + activeCostume.images.length) %
        activeCostume.images.length,
    );
  };

  next.onclick = (event) => {
    showFullImage(
      document.getElementById("right-menu__top__content").children[
        (imageIndex + 1) % activeCostume.images.length
      ],
      activeCostume.images[(imageIndex + 1) % activeCostume.images.length].name,
      (imageIndex + 1) % activeCostume.images.length,
    );
  };

  name.textContent = imageName;
}

function createCloseButton(size) {
  let closeButton = document.createElement("div");
  closeButton.className = "close-button";
  closeButton.title = "Close";

  let cross = document.createElement("img");
  cross.src = "/icons/cross.svg";
  cross.alt = "Close";
  cross.style.width = size;
  cross.style.height = size;

  closeButton.appendChild(cross);

  return closeButton;
}

function resetCamera() {
  CONTROLS.reset();
  CONTROLS.enablePan = true;
  CONTROLS.enableDamping = true;
  CONTROLS.dampingFactor = 0.1;
}

// sets functionality of the About element
function setAboutButtons() {
  let closeButton = createCloseButton("35px");
  closeButton.style = "grid-row-start: 1; grid-column-start: 2";
  let aboutContainer = document.getElementById("about-container");
  closeButton.onclick = () => {
    hideElem(aboutContainer);
  };
  aboutContainer.appendChild(closeButton);

  document.getElementById("show-about").onclick = () => {
    showElem(aboutContainer);
  };
}

// constructs a part's toggle button
function placePartToggle(index, toggleButtonsContainer, parentCostume) {
  let toggle = document.createElement("button");

  if (activeParts[index]) {
    toggle.className = "part-toggle-button main-font green";
  } else {
    toggle.className = "part-toggle-button main-font";
  }

  toggle.textContent = parentCostume.parts[index].name;
  toggle.index = index;

  toggleButtonsContainer.appendChild(toggle);

  toggle.onclick = () => {
    togglePart(toggle.index, toggle);
  };
}

// constructs a part's toggle button for a preview model
function placePartTogglePreview(index, toggleButtonsContainer) {
  let toggle = document.createElement("button");

  if (activeParts[index]) {
    toggle.className = "part-toggle-button main-font green";
  } else {
    toggle.className = "part-toggle-button main-font";
  }

  toggle.textContent = index;
  toggle.index = index;

  toggleButtonsContainer.appendChild(toggle);
  toggle.onclick = () => {
    togglePart(toggle.index, toggle);
  };
}

// construct images in the right menu
function displayImages(rightMenuList, activeCostume) {
  rightMenuSelected = 0;
  document.getElementById("images-button").className =
    "main-font small-font green";
  document.getElementById("parts-button").className = "main-font small-font";
  document.getElementById("costumes-button").className = "main-font small-font";
  rightMenuList.innerHTML = "";

  for (let i = 0; i < activeCostume.images.length; i++) {
    loadImage(
      BASE_URL + activeCostume.images[i].path,
      "Image Missing",
      activeCostume.images[i].name,
      rightMenuList,
      i,
    );
  }
}

// construct part toggles in the right menu
function displayPartToggles(togglesContainer, activeCostume) {
  rightMenuSelected = 1;
  document.getElementById("images-button").className = "main-font small-font";
  document.getElementById("parts-button").className =
    "main-font small-font green";
  document.getElementById("costumes-button").className = "main-font small-font";
  togglesContainer.innerHTML = "";

  if (activeCostumeID == -2) {
    for (let i = 0; i < activeParts.length; i++) {
      placePartTogglePreview(i, togglesContainer);
    }
  } else {
    for (let i = 0; i < activeParts.length; i++) {
      placePartToggle(i, togglesContainer, activeCostume);
    }
  }
}

// construct buttons for selecting costumes in the right menu
function displayModelSelectButtons(costumesContainer, loader) {
  rightMenuSelected = 2;
  document.getElementById("images-button").className = "main-font small-font";
  document.getElementById("parts-button").className = "main-font small-font";
  document.getElementById("costumes-button").className =
    "main-font small-font green";
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
        replaceCostume(loader, COSTUMES[i]);
      };
      placeModelSelectCardButton(COSTUMES[i], modelSelectCard);
    } else {
      placeModelSelectButton(COSTUMES[i], costumesContainer, loader);
    }
  }
}

// place a button for model selection
function placeModelSelectButton(costume, modelSelectorContainer, loader) {
  let select = document.createElement("button");
  select.className = "main-font medium-font";
  select.textContent = costume.name;
  select.costume = costume;

  modelSelectorContainer.appendChild(select);

  select.onclick = () => {
    replaceCostume(loader, select.costume);
  };
}

// place a button for model selection with image
function placeModelSelectCardButton(costume, modelSelectCard) {
  let select = document.createElement("button");
  select.className = "main-font medium-font";
  select.textContent = costume.name;

  modelSelectCard.appendChild(select);
}

function setupFormClose() {
  let closeButton = document.createElement("div");
  closeButton.className = "close-button";
  closeButton.title = "Close";
  closeButton.onclick = () => {
    hideElem(COSTUME_UPLOAD_FORM);
  };

  let cross = document.createElement("img");
  cross.src = "/icons/cross.svg";
  cross.alt = "Close";
  cross.style.width = "70%";
  cross.style.height = "70%";

  closeButton.appendChild(cross);
  document.getElementById("form__title").appendChild(closeButton);
}

// generate a grid of image+input field pair in the form for filling image names
function getImages(evt) {
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

// generate a grid of input field pair in the form for filling part names
function getParts(evt) {
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

// loads costume from the upload form for preview
async function loadCostumePreview(loader, parts) {
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
  return new LoadedCostume(-2, partMeshes);
}

// displays costume from the upload form
async function previewUploadModel() {
  parts = document.getElementById("parts").files;

  if (parts == null || parts.length == 0) return 0;

  hideElem(COSTUME_UPLOAD_FORM);

  let loading = displayLoadingIcon();

  if (activeCostumeID != -1) {
    removeCostumeFromScene(getLoadedCostumeIndex(activeCostumeID), activeParts);
  }

  console.log("Previewing model.");
  let loadedCostume = await loadCostumePreview(GLTF_LOADER, parts);

  if (loadedCostumes.length >= MAX_LOADED) {
    disposeOldest(loadedCostumes);
  }

  loadedCostumes.push(loadedCostume);
  let newCostumeIndex = loadedCostumes.length - 1;
  placeCostume(loadedCostumes[newCostumeIndex]);

  activeParts = new Array(
    loadedCostumes[newCostumeIndex].partMeshes.length,
  ).fill(true);
  activeCostumeID = -2;

  if (rightMenuSelected == 1) {
    displayPartToggles(rightMenuList, null);
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

// submit form with file size check, waits for results
async function submit(e) {
  e.preventDefault();

  hideElem(COSTUME_UPLOAD_FORM);

  let loadingIcon = displayLoadingIcon();

  let successContainer = document.createElement("div");
  successContainer.className = "success-container";

  let success = document.createElement("div");
  success.className = "main-font large-font success";

  successContainer.appendChild(success);

  // check size
  const PART_FILES = e.target.elements["partFiles"].files;
  const IMAGES = e.target.elements["images"].files;
  let fileSize = 0;

  for (let i = 0; i < PART_FILES.length; i++) {
    fileSize += PART_FILES[i].size / 1024 / 1024;
  }
  for (let i = 0; i < IMAGES.length; i++) {
    fileSize += IMAGES[i].size / 1024 / 1024;
  }

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
    const FORM_DATA = new FormData(e.target);

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

// handles a change of layout and functionality on touchscreens and narrow screens
function onResize() {
  if (IS_TOUCH || window.innerWidth < 768) {
    let leftMenu = document.getElementById("left-menu");
    let leftMenuButton = document.getElementById("left-menu__button");
    let rightMenu = document.getElementById("right-menu");
    let rightMenuButton = document.getElementById("right-menu__button");
    let form = document.getElementById("costume-form");
    let rightMenuButtons = document.getElementsByClassName(
      "right-menu__top__buttons-container",
    )[0];

    // set menus fullscreen
    leftMenu.style.width = "100%";
    rightMenu.style.width = "100%";
    leftMenu.style.height = "100%";
    rightMenu.style.height = "100%";
    leftMenu.style.maxWidth = "none";
    rightMenu.style.maxWidth = "none";

    form.style.width = "100%";
    form.style.height = "100%";
    form.style.borderRadius = "0px";

    rightMenuButton.className =
      "menu-button right-button menu-button--bottom main-font";
    leftMenuButton.className =
      "menu-button left-button menu-button--bottom main-font";

    // setup close button funcitonality
    let closeLeft = createCloseButton("25px");
    closeLeft.onclick = () => {
      showHide("left-menu__button", "left-menu");
      leftMenu.style.zIndex = 10;
      rightMenuButton.style.opacity = 1;
      leftMenu.style.pointerEvents = "none";
    };
    leftMenu.appendChild(closeLeft);

    let closeRight = createCloseButton("25px");
    closeRight.onclick = () => {
      closeRightMenu();
    };
    rightMenuButtons.appendChild(closeRight);

    function closeRightMenu() {
      showHide("right-menu__button", "right-menu");
      rightMenu.style.zIndex = 10;
      leftMenuButton.style.opacity = 1;
      rightMenu.style.pointerEvents = "none";
    }

    document.getElementById("contribute").addEventListener(
      "click",
      () => {
        closeRightMenu();
      },
      false,
    );

    // hides costume name into left menu and sets up menu buttons for fouch
    document.getElementById("left-menu__description-container").style.opacity =
      1;
    leftMenu.style.opacity = 0;
    leftMenu.style.pointerEvents = "none";
    leftMenuButton.style.zIndex = 11;
    leftMenuButton.onclick = () => {
      showHide("left-menu", "left-menu__button");
      leftMenu.style.pointerEvents = "all";
      leftMenu.style.zIndex = 12;
      rightMenuButton.style.opacity = 0;
    };

    rightMenu.style.pointerEvents = "none";
    rightMenuButton.style.zIndex = 11;
    rightMenuButton.onclick = () => {
      showHide("right-menu", "right-menu__button");
      rightMenu.style.pointerEvents = "all";
      rightMenu.style.zIndex = 12;
      leftMenuButton.style.opacity = 0;
    };
  } else {
    document.getElementById("right-menu").addEventListener(
      "mouseover",
      (event) => {
        showHide("right-menu", "right-menu__button");
      },
      false,
    );
    document.getElementById("right-menu").addEventListener(
      "mouseout",
      (event) => {
        showHide("right-menu__button", "right-menu");
      },
      false,
    );

    document
      .getElementById("left-menu__description-container")
      .addEventListener(
        "mouseover",
        (event) => {
          showHide("left-menu__description-container", "left-menu__button");
        },
        false,
      );
    document
      .getElementById("left-menu__description-container")
      .addEventListener(
        "mouseout",
        (event) => {
          showHide("left-menu__button", "left-menu__description-container");
        },
        false,
      );
  }
}

function getCostumeIndex(costumeID) {
  for (let i = 0; i < COSTUMES.length; i++) {
    if (COSTUMES[i].costumeID == costumeID) {
      return i;
    }
  }
  return -1;
}

function getLoadedCostumeIndex(costumeID) {
  for (let i = 0; i < loadedCostumes.length; i++) {
    if (loadedCostumes[i].costumeID == costumeID) {
      return i;
    }
  }
  return -1;
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
