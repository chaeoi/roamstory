// ===================== 数据装载 =====================
let places = [];
let gallery = [];
let PHOTO_PLACES = new Set();

// 每张照片在数据里直接写完整 URL（可来自不同来源），此处仅做取值与清洗
function photoUrl(photo) {
  const src = typeof photo === 'string' ? photo : photo && photo.src;
  return typeof src === 'string' ? src.trim() : '';
}

async function loadTravelData() {
  const response = await fetch('data/travel.json');
  if (!response.ok) throw new Error(`Failed to load travel data: ${response.status}`);

  const data = await response.json();
  places = Array.isArray(data.places) ? data.places : [];
  gallery = (Array.isArray(data.gallery) ? data.gallery : [])
    .map((item) => ({
      place: item.place,
      photos: (Array.isArray(item.photos) ? item.photos : []).map(photoUrl).filter(Boolean),
    }))
    .filter((item) => item.place && item.photos.length);
  PHOTO_PLACES = new Set(gallery.map((g) => g.place));
}
// ===================== 路由 =====================
const navLinks = document.querySelectorAll('.navbar__link');
const views = {
  map: document.getElementById('view-map'),
  album: document.getElementById('view-album'),
};

let pendingFocus = null; // 点击地图标记后待定位的地点

function currentRoute() {
  return window.location.hash.replace('#/', '') || 'map';
}

function applyRoute() {
  const route = currentRoute();
  const view = route === 'album' ? 'album' : 'map';

  Object.keys(views).forEach((key) => {
    views[key].classList.toggle('is-active', key === view);
  });
  navLinks.forEach((a) => {
    a.classList.toggle('is-active', a.dataset.route === view);
  });

  if (view === 'map') {
    // 地图容器在重新可见后可能需要重算尺寸
    if (chart) requestAnimationFrame(() => chart.resize());
  } else if (view === 'album' && pendingFocus) {
    const place = pendingFocus;
    pendingFocus = null;
    focusPlace(place);
  }
}

window.addEventListener('hashchange', applyRoute);

function selectPlace(place) {
  pendingFocus = place;
  window.location.hash = '#/album';
}

// ===================== 地图 =====================
const WORLD_CENTER = [0, 0];
const WORLD_BOUNDS = [[-180, 90], [180, -90]];
const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
const FONT = '"LXGW WenKai Screen", "PingFang SC", "Microsoft YaHei", sans-serif';

let chart = null;
let resizeRaf = null;

// 区域名改中文 + 南海诸岛归一化
function normalizeMap(geoJson) {
  (geoJson.features || []).forEach((f) => {
    const p = f.properties || {};
    if (p.adchar === 'JD' || p.adcode === '100000_JD') {
      p.name = '南海诸岛';
    } else if (p.NAME_ZH) {
      p.name = p.NAME_ZH;
    }
    f.properties = p;
  });
}

const toPoint = (pl) => ({
  name: pl.name,
  value: [pl.latLng[1], pl.latLng[0]],
  hasPhoto: PHOTO_PLACES.has(pl.name),
});

function resetWorldView() {
  if (!chart) return;
  chart.setOption({ geo: { center: WORLD_CENTER, zoom: MIN_ZOOM } });
}

async function loadMap() {
  const res = await fetch('maps/world.json');
  const geo = await res.json();
  normalizeMap(geo);
  echarts.registerMap('world', geo);

  chart = echarts.init(document.getElementById('map-chart'), null, { renderer: 'canvas' });

  const withPhoto = places.filter((p) => PHOTO_PLACES.has(p.name)).map(toPoint);
  const withoutPhoto = places.filter((p) => !PHOTO_PLACES.has(p.name)).map(toPoint);

  chart.setOption({
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT },
    tooltip: {
      trigger: 'item',
      borderWidth: 0,
      padding: [6, 10],
      backgroundColor: 'rgba(31,35,40,0.92)',
      textStyle: { color: '#fff', fontSize: 13, fontFamily: FONT },
      formatter: (p) => {
        if (p.componentType === 'series') {
          return p.data && p.data.hasPhoto ? `${p.data.name} · 点击看相册` : (p.data && p.data.name) || '';
        }
        return p.name || '';
      },
    },
    geo: {
      map: 'world',
      roam: true,
      center: WORLD_CENTER,
      zoom: MIN_ZOOM,
      boundingCoords: WORLD_BOUNDS,
      left: 0, right: 0, top: 0, bottom: 0,
      preserveAspect: 'contain',
      scaleLimit: { min: MIN_ZOOM, max: MAX_ZOOM },
      label: { show: false },
      itemStyle: {
        areaColor: '#eef3f7',
        borderColor: '#c4d0dc',
        borderWidth: 0.75,
      },
      emphasis: {
        label: { show: false },
        itemStyle: { areaColor: '#dbeafe' },
      },
      select: { disabled: true },
      regions: [
        {
          name: '南海诸岛',
          itemStyle: { areaColor: 'rgba(216,77,77,0.05)', borderColor: '#8d9cac', borderWidth: 0.8 },
        },
      ],
    },
    series: [
      {
        name: '足迹',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        zlevel: 2,
        data: withoutPhoto,
        symbol: 'circle',
        symbolSize: 8,
        showEffectOn: 'emphasis',
        rippleEffect: { number: 0 },
        itemStyle: { color: '#9aa7b4', borderColor: '#fff', borderWidth: 1.5 },
        emphasis: { scale: 1.5, itemStyle: { color: '#687076' } },
      },
      {
        name: '相册',
        type: 'effectScatter',
        coordinateSystem: 'geo',
        zlevel: 3,
        data: withPhoto,
        symbol: 'circle',
        symbolSize: 9,
        showEffectOn: 'emphasis',
        rippleEffect: { number: 0 },
        itemStyle: { color: '#d84d4d', borderColor: '#fff', borderWidth: 1.5 },
        emphasis: { scale: 1.4 },
      },
    ],
  });

  chart.on('click', (params) => {
    if (params.seriesName === '相册' && params.data && params.data.name) {
      selectPlace(params.data.name);
    }
  });
  chart.on('mouseover', (params) => {
    if (params.seriesName === '相册') chart.getZr().setCursorStyle('pointer');
  });
  chart.on('mouseout', () => chart.getZr().setCursorStyle('default'));
  chart.on('georoam', () => {
    const opt = chart.getOption();
    const zoom = opt && opt.geo && opt.geo[0] && opt.geo[0].zoom;
    if (zoom <= MIN_ZOOM + 0.001) resetWorldView();
  });

  window.addEventListener('resize', () => {
    if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
    resizeRaf = window.requestAnimationFrame(() => {
      resizeRaf = null;
      chart.resize();
    });
  });

  document.getElementById('map-loading').style.display = 'none';
}

// ===================== 相册渲染 =====================
const placeEls = {}; // place name -> 地点块 DOM

function renderAlbum() {
  document.getElementById('map-count').textContent = String(places.length);
  document.getElementById('album-place-count').textContent = String(gallery.length);

  const list = document.getElementById('album-list');
  gallery.forEach((item) => {
    const block = document.createElement('div');
    block.className = 'place';

    const head = document.createElement('div');
    head.className = 'place__head';
    const h3 = document.createElement('h3');
    h3.className = 'place__name';
    h3.textContent = item.place;
    const count = document.createElement('span');
    count.className = 'place__count';
    count.textContent = `${item.photos.length} 张`;
    head.append(h3, count);

    const grid = document.createElement('div');
    grid.className = 'grid';
    item.photos.forEach((src, i) => {
      const btn = document.createElement('button');
      btn.className = 'thumb';
      btn.addEventListener('click', () => openViewer(item, i));

      const img = document.createElement('img');
      img.src = src;
      img.alt = item.place;
      img.loading = 'lazy';

      const overlay = document.createElement('span');
      overlay.className = 'thumb__overlay';

      btn.append(img, overlay);
      grid.append(btn);
    });

    block.append(head, grid);
    list.append(block);
    placeEls[item.place] = block;
  });
}

function focusPlace(place) {
  const el = placeEls[place];
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('is-highlight');
  setTimeout(() => el.classList.remove('is-highlight'), 1600);
}

// ===================== Lightbox =====================
let viewer = null; // { item, index }
let lightboxEl = null;

function openViewer(item, index) {
  viewer = { item, index };
  document.body.classList.add('no-scroll');
  document.documentElement.classList.add('no-scroll');
  renderViewer();
}

function closeViewer() {
  viewer = null;
  document.body.classList.remove('no-scroll');
  document.documentElement.classList.remove('no-scroll');
  if (lightboxEl) {
    lightboxEl.remove();
    lightboxEl = null;
  }
}

function step(dir) {
  if (!viewer) return;
  const len = viewer.item.photos.length;
  viewer.index = (viewer.index + dir + len) % len;
  renderViewer();
}

function jump(index) {
  if (!viewer) return;
  viewer.index = index;
  renderViewer();
}

function preloadAdjacent() {
  if (!viewer) return;
  const { item, index } = viewer;
  [index + 1, index - 1].forEach((i) => {
    const src = item.photos[(i + item.photos.length) % item.photos.length];
    if (src) {
      const img = new Image();
      img.src = src;
    }
  });
}

function renderViewer() {
  if (!viewer) return;
  const { item, index } = viewer;
  const multi = item.photos.length > 1;

  if (!lightboxEl) {
    lightboxEl = document.createElement('div');
    lightboxEl.className = 'lightbox';
    lightboxEl.addEventListener('click', closeViewer); // 点击遮罩关闭
    document.body.append(lightboxEl);
  }
  lightboxEl.innerHTML = '';

  // 顶栏
  const top = document.createElement('div');
  top.className = 'lightbox__top';
  top.addEventListener('click', (e) => e.stopPropagation());
  const title = document.createElement('div');
  title.className = 'lightbox__title';
  const place = document.createElement('span');
  place.className = 'lightbox__place';
  place.textContent = item.place;
  const counter = document.createElement('span');
  counter.className = 'lightbox__counter';
  counter.textContent = `${index + 1} / ${item.photos.length}`;
  title.append(place, counter);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'lightbox__close';
  closeBtn.setAttribute('aria-label', '关闭 (Esc)');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeViewer);
  top.append(title, closeBtn);

  // 主图区
  const main = document.createElement('div');
  main.className = 'lightbox__main';
  const img = document.createElement('img');
  img.className = 'lightbox__img';
  img.src = item.photos[index];
  img.alt = item.place;
  img.addEventListener('click', (e) => e.stopPropagation());
  main.append(img);

  if (multi) {
    const prev = document.createElement('button');
    prev.className = 'lightbox__nav lightbox__nav--prev';
    prev.setAttribute('aria-label', '上一张 (←)');
    prev.textContent = '‹';
    prev.addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
    const next = document.createElement('button');
    next.className = 'lightbox__nav lightbox__nav--next';
    next.setAttribute('aria-label', '下一张 (→)');
    next.textContent = '›';
    next.addEventListener('click', (e) => { e.stopPropagation(); step(1); });
    main.append(prev, next);
  }

  lightboxEl.append(top, main);

  // 底部缩略图条
  if (multi) {
    const strip = document.createElement('div');
    strip.className = 'lightbox__strip';
    strip.addEventListener('click', (e) => e.stopPropagation());
    item.photos.forEach((src, i) => {
      const btn = document.createElement('button');
      btn.className = 'lightbox__thumb' + (i === index ? ' is-active' : '');
      btn.addEventListener('click', () => jump(i));
      const timg = document.createElement('img');
      timg.src = src;
      timg.alt = '';
      btn.append(timg);
      strip.append(btn);
    });
    lightboxEl.append(strip);
  }

  preloadAdjacent();
}

window.addEventListener('keydown', (e) => {
  if (!viewer) return;
  if (e.key === 'Escape') closeViewer();
  else if (e.key === 'ArrowLeft') step(-1);
  else if (e.key === 'ArrowRight') step(1);
});

// ===================== 启动 =====================
async function boot() {
  await loadTravelData();
  renderAlbum();
  applyRoute();
  await loadMap();
}

boot().catch((error) => {
  console.error('App boot failed:', error);
  const loading = document.getElementById('map-loading');
  if (loading) loading.textContent = '页面加载失败';
});
