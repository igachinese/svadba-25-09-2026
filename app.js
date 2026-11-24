(function () {
  "use strict";

  const cfg = window.GALLERY_CONFIG || {};
  const data = window.GALLERY_DATA || { cover: "", folders: [] };

  const heroBg = document.getElementById("hero-bg");
  const heroTitle = document.getElementById("hero-title");
  const heroDate = document.getElementById("hero-date");
  const heroSubtitle = document.getElementById("hero-subtitle");
  const heroScroll = document.getElementById("hero-scroll");
  const toolbar = document.getElementById("toolbar");
  const tabsEl = document.getElementById("folder-tabs");
  const countEl = document.getElementById("folder-count");
  const gridEl = document.getElementById("gallery-grid");
  const sentinelEl = document.getElementById("gallery-sentinel");
  const footerText = document.getElementById("footer-text");
  const scrollTopBtn = document.getElementById("scroll-top");

  const downloadWrap = document.getElementById("download-wrap");
  const downloadBtn = document.getElementById("btn-download-toggle");
  const downloadMenu = document.getElementById("download-menu");

  const lightbox = document.getElementById("lightbox");
  const lbImg = document.getElementById("lb-img");
  const lbCounter = document.getElementById("lb-counter");
  const lbCaption = document.getElementById("lb-caption");
  const lbDownload = document.getElementById("lb-download");
  const lbZoom = document.getElementById("lb-zoom");
  const lbClose = document.getElementById("lb-close");
  const lbPrev = document.getElementById("lb-prev");
  const lbNext = document.getElementById("lb-next");
  const lbStage = document.getElementById("lb-stage");

  let activeFolderIndex = 0;
  let renderedCount = 0;
  const CHUNK_SIZE = 48;
  let currentPhotos = [];
  let lbIndex = 0;
  let touchStartX = 0;

  // Apply config
  const titleText = cfg.title || "Свадьба";
  const dateText = cfg.date || "25.09.2026";
  document.title = dateText ? `${titleText} — ${dateText}` : titleText;
  heroTitle.textContent = titleText;
  heroDate.textContent = dateText;
  footerText.textContent = dateText ? `${titleText} · ${dateText}` : titleText;

  if (cfg.subtitle) {
    heroSubtitle.textContent = cfg.subtitle;
    heroSubtitle.hidden = false;
  }

  if (data.cover) {
    heroBg.src = data.cover;
  }

  heroScroll.addEventListener("click", () => {
    toolbar.scrollIntoView({ behavior: "smooth" });
  });

  // Format Russian plural for "фото"
  function formatCount(n) {
    return `${n} фото`;
  }

  // Render tabs
  function renderTabs() {
    tabsEl.innerHTML = "";
    data.folders.forEach((folder, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab" + (idx === activeFolderIndex ? " is-active" : "");
      btn.textContent = folder.title;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", idx === activeFolderIndex ? "true" : "false");
      btn.addEventListener("click", () => selectFolder(idx, true));
      tabsEl.appendChild(btn);
    });
  }

  // Render download dropdown
  function renderDownloadMenu() {
    const folder = data.folders[activeFolderIndex];
    const allUrl = (cfg.downloadAllUrl || "").trim();
    const folderUrl = folder && cfg.folderDownloadUrls ? (cfg.folderDownloadUrls[folder.id] || "").trim() : "";

    downloadMenu.innerHTML = "";

    if (!allUrl && !folderUrl) {
      const msg = document.createElement("div");
      msg.className = "download-empty";
      msg.textContent =
        "Ссылка на скачивание оригиналов с Google Диска пока не добавлена. Посмотреть или скачать отдельные фото можно прямо в галерее.";
      downloadMenu.appendChild(msg);
      return;
    }

    if (allUrl) {
      downloadMenu.appendChild(
        createDownloadItem(
          "Весь проект",
          "Все 3 папки на Google Диске",
          allUrl,
          `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
        )
      );
    }

    if (folderUrl && folder) {
      downloadMenu.appendChild(
        createDownloadItem(
          "Текущую папку",
          folder.title,
          folderUrl,
          `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
        )
      );
    }
  }

  function createDownloadItem(title, sub, url, iconSvg) {
    const link = document.createElement("a");
    link.className = "download-item";
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `
      <span class="download-item__icon">${iconSvg}</span>
      <span>
        <div class="download-item__title">${title}</div>
        <div class="download-item__sub">${sub}</div>
      </span>
    `;
    link.addEventListener("click", closeDownloadMenu);
    return link;
  }

  function toggleDownloadMenu() {
    const isOpen = !downloadMenu.hidden;
    if (isOpen) {
      closeDownloadMenu();
    } else {
      renderDownloadMenu();
      downloadMenu.hidden = false;
      downloadBtn.classList.add("is-open");
      downloadBtn.setAttribute("aria-expanded", "true");
    }
  }

  function closeDownloadMenu() {
    downloadMenu.hidden = true;
    downloadBtn.classList.remove("is-open");
    downloadBtn.setAttribute("aria-expanded", "false");
  }

  downloadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDownloadMenu();
  });

  document.addEventListener("click", (e) => {
    if (!downloadWrap.contains(e.target)) {
      closeDownloadMenu();
    }
  });

  // Justified storyboard row builder
  function getTargetRowHeight(containerWidth) {
    if (containerWidth < 520) return 190;
    if (containerWidth < 900) return 260;
    return 330;
  }

  function getGap() {
    return window.innerWidth <= 768 ? 10 : 20;
  }

  function buildJustifiedRows(photos, containerWidth) {
    const gap = getGap();
    const targetH = getTargetRowHeight(containerWidth);
    const rows = [];
    let row = [];
    let aspectSum = 0;

    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      const ar = (p.w || 3) / (p.h || 2);
      row.push({ photo: p, index: i, ar });
      aspectSum += ar;

      const rowWidthAtTarget = aspectSum * targetH + gap * (row.length - 1);
      if (rowWidthAtTarget >= containerWidth && row.length >= 2) {
        const exactH = (containerWidth - gap * (row.length - 1)) / aspectSum;
        rows.push({ items: row, height: exactH, justified: true });
        row = [];
        aspectSum = 0;
      }
    }

    if (row.length > 0) {
      // Keep last incomplete row proportional without stretching awkwardly
      const naturalH = Math.min(
        targetH,
        (containerWidth - gap * (row.length - 1)) / Math.max(aspectSum, 0.5)
      );
      rows.push({ items: row, height: naturalH, justified: false });
    }

    return rows;
  }

  function renderGallery(resetChunk) {
    const containerWidth = gridEl.clientWidth;
    if (!containerWidth) return;

    if (resetChunk) {
      renderedCount = Math.min(CHUNK_SIZE, currentPhotos.length);
    }

    const slice = currentPhotos.slice(0, renderedCount);
    const rows = buildJustifiedRows(slice, containerWidth);

    const frag = document.createDocumentFragment();
    rows.forEach((rowObj) => {
      const rowEl = document.createElement("div");
      rowEl.className = "gallery-row";

      rowObj.items.forEach(({ photo, index, ar }) => {
        const card = document.createElement("div");
        card.className = "photo-card";
        const w = Math.round(rowObj.height * ar);
        const h = Math.round(rowObj.height);
        card.style.width = `${w}px`;
        card.style.height = `${h}px`;

        const img = document.createElement("img");
        img.src = photo.thumb;
        img.alt = photo.name;
        img.loading = "lazy";
        img.decoding = "async";
        if (img.complete) {
          img.classList.add("is-loaded");
        } else {
          img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
        }

        const dl = document.createElement("a");
        dl.className = "photo-card__dl";
        dl.href = photo.src;
        dl.download = photo.name;
        dl.title = `Скачать ${photo.name}`;
        dl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
        dl.addEventListener("click", (e) => e.stopPropagation());

        card.addEventListener("click", () => openLightbox(index));
        card.appendChild(img);
        card.appendChild(dl);
        rowEl.appendChild(card);
      });

      frag.appendChild(rowEl);
    });

    gridEl.innerHTML = "";
    gridEl.appendChild(frag);
  }

  function appendNextChunk() {
    if (renderedCount >= currentPhotos.length) return;
    renderedCount = Math.min(renderedCount + CHUNK_SIZE, currentPhotos.length);
    renderGallery(false);
  }

  function selectFolder(idx, scrollToToolbar) {
    if (!data.folders[idx]) return;
    activeFolderIndex = idx;
    currentPhotos = data.folders[idx].photos || [];
    countEl.textContent = formatCount(currentPhotos.length);
    renderTabs();
    renderDownloadMenu();
    renderGallery(true);

    // Update URL hash for shareable folder link
    if (history.replaceState) {
      history.replaceState(null, "", `#${data.folders[idx].id}`);
    }

    if (scrollToToolbar) {
      const top = toolbar.getBoundingClientRect().top + window.scrollY;
      if (window.scrollY > top) {
        window.scrollTo({ top, behavior: "smooth" });
      }
    }
  }

  // Infinite progressive chunk loading
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        appendNextChunk();
      }
    },
    { rootMargin: "700px 0px" }
  );
  observer.observe(sentinelEl);

  // Reflow on resize
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderGallery(false), 120);
  });

  // Scroll-to-top button visibility
  window.addEventListener(
    "scroll",
    () => {
      scrollTopBtn.hidden = window.scrollY < 700;
    },
    { passive: true }
  );

  scrollTopBtn.addEventListener("click", () => {
    toolbar.scrollIntoView({ behavior: "smooth" });
  });

  // Lightbox
  function openLightbox(index) {
    lbIndex = index;
    updateLightbox();
    lightbox.hidden = false;
    document.body.classList.add("no-scroll");
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lbImg.classList.remove("is-zoomed");
    document.body.classList.remove("no-scroll");
  }

  function updateLightbox() {
    const photo = currentPhotos[lbIndex];
    if (!photo) return;
    lbImg.classList.remove("is-zoomed");
    lbImg.src = photo.src;
    lbImg.alt = photo.name;
    lbCounter.textContent = `${lbIndex + 1} / ${currentPhotos.length}`;
    lbCaption.textContent = photo.name;
    lbDownload.href = photo.src;
    lbDownload.download = photo.name;

    // Preload neighbors
    const prev = currentPhotos[(lbIndex - 1 + currentPhotos.length) % currentPhotos.length];
    const next = currentPhotos[(lbIndex + 1) % currentPhotos.length];
    if (prev) new Image().src = prev.src;
    if (next) new Image().src = next.src;
  }

  function stepLightbox(delta) {
    if (!currentPhotos.length) return;
    lbIndex = (lbIndex + delta + currentPhotos.length) % currentPhotos.length;
    updateLightbox();
  }

  lbClose.addEventListener("click", closeLightbox);
  lbPrev.addEventListener("click", () => stepLightbox(-1));
  lbNext.addEventListener("click", () => stepLightbox(1));
  lbZoom.addEventListener("click", () => lbImg.classList.toggle("is-zoomed"));
  lbImg.addEventListener("click", () => lbImg.classList.toggle("is-zoomed"));

  document.addEventListener("keydown", (e) => {
    if (lightbox.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
  });

  lbStage.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.changedTouches[0].clientX;
    },
    { passive: true }
  );

  lbStage.addEventListener(
    "touchend",
    (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 48) {
        stepLightbox(dx < 0 ? 1 : -1);
      }
    },
    { passive: true }
  );

  // Init from hash if present
  const hashId = window.location.hash.replace("#", "");
  const initialIdx = Math.max(
    0,
    data.folders.findIndex((f) => f.id === hashId)
  );
  selectFolder(initialIdx, false);
})();
