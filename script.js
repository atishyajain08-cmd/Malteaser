const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function createBrandLoader() {
  const existing = document.querySelector(".loader");
  if (existing) return existing;
  const loader = document.createElement("div");
  loader.className = "loader";
  loader.setAttribute("role", "status");
  loader.setAttribute("aria-label", "Malteaser is preparing the collection");
  loader.innerHTML = `
    <div class="loader__intro">
      <span class="loader__cue">Start writing</span>
      <div class="loader__word" aria-hidden="true">
        ${[..."Malteaser"].map((letter, index) => `<span style="--letter:${index}">${letter}</span>`).join("")}
      </div>
      <span class="loader__tagline">Elevated women's fashion</span>
    </div>`;
  document.body.prepend(loader);
  return loader;
}

const brandLoader = createBrandLoader();
const loaderStartedAt = performance.now();

function hideBrandLoader() {
  const remaining = Math.max(0, 1050 - (performance.now() - loaderStartedAt));
  window.setTimeout(() => brandLoader?.classList.add("is-hidden"), remaining);
}

window.addEventListener("load", () => {
  if (!document.querySelector("[data-catalog-section], [data-product-detail]")) hideBrandLoader();
  window.lucide?.createIcons();
});

window.addEventListener("malteaser:catalog-ready", hideBrandLoader);
window.setTimeout(hideBrandLoader, 4500);

const header = document.querySelector(".site-header");
const revealItems = document.querySelectorAll("[data-reveal]");
const gatewayCards = document.querySelectorAll(".gateway-card");
const parallaxLayers = document.querySelectorAll(".parallax-layer");
const assembly = document.querySelector(".assembly");
const horizontal = document.querySelector(".horizontal-showcase");
const showcaseTrack = document.querySelector(".showcase-track");
const assemblyPieces = document.querySelectorAll(".piece");
const assembledLook = document.querySelector(".assembled-look");
const ribbons = document.querySelectorAll(".fabric-ribbon");
const beachHero = document.querySelector(".beach-hero");
const outfitLooks = document.querySelectorAll(".outfit-look");
const outfitCaption = document.querySelector(".outfit-caption");
const heroSticky = beachHero?.querySelector(".hero__sticky");
let activeOutfitIndex = 0;

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 }
);

revealItems.forEach((item) => revealObserver.observe(item));

const gatewayObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle("is-in-frame", entry.isIntersecting);
    });
  },
  {
    threshold: 0.42,
    rootMargin: "-8% 0px -8% 0px"
  }
);

gatewayCards.forEach((card) => gatewayObserver.observe(card));

function updateHeader() {
  if (!header || document.body.classList.contains("inner-page")) return;
  const progress = clamp(window.scrollY / 160, 0, 1);
  const colorValue = Math.round(248 - progress * 214);
  header.style.setProperty("--header-bg-alpha", (progress * 0.9).toFixed(3));
  header.style.setProperty("--header-blur", `${Math.round(progress * 18)}px`);
  header.style.setProperty("--header-shadow-alpha", (progress * 0.08).toFixed(3));
  header.style.color = `rgb(${colorValue}, ${Math.round(244 - progress * 210)}, ${Math.round(238 - progress * 204)})`;
  header.classList.toggle("is-scrolled", progress > 0.62);
}

function updateParallax() {
  parallaxLayers.forEach((layer) => {
    const speed = Number(layer.dataset.speed || 0.1);
    const rect = layer.getBoundingClientRect();
    const offset = rect.top * speed;
    if (layer.closest(".beach-hero")) {
      heroSticky?.style.setProperty("--hero-scroll-depth", `${offset}px`);
      return;
    }
    layer.style.transform = `translate3d(0, ${offset}px, 0)`;
  });
}

function updateAssembly() {
  if (!assembly || window.matchMedia("(max-width: 680px)").matches) return;
  const rect = assembly.getBoundingClientRect();
  const progress = clamp(-rect.top / (rect.height - window.innerHeight), 0, 1);
  const transforms = [
    { x: -220, y: -90, rotate: -18 },
    { x: 230, y: -120, rotate: 16 },
    { x: -160, y: 180, rotate: 12 }
  ];

  assemblyPieces.forEach((piece, index) => {
    const t = transforms[index];
    const ease = progress * progress * (3 - 2 * progress);
    piece.style.transform = `translate3d(${t.x * (1 - ease)}px, ${t.y * (1 - ease)}px, 0) rotate(${t.rotate * (1 - ease)}deg)`;
    piece.style.opacity = 0.22 + ease * 0.78;
  });

  if (assembledLook) {
    assembledLook.style.transform = `scale(${0.9 + progress * 0.1}) translateY(${24 * (1 - progress)}px)`;
  }

  ribbons.forEach((ribbon, index) => {
    const direction = index % 2 === 0 ? 1 : -1;
    ribbon.style.transform = `translateX(${direction * progress * 18}%) rotate(${direction * (8 + progress * 5)}deg)`;
  });
}

function updateHorizontalShowcase() {
  if (!horizontal || !showcaseTrack || window.matchMedia("(max-width: 680px)").matches) return;
  const rect = horizontal.getBoundingClientRect();
  const progress = clamp(-rect.top / (rect.height - window.innerHeight), 0, 1);
  const maxMove = showcaseTrack.scrollWidth - window.innerWidth + 76;
  showcaseTrack.style.transform = `translate3d(${-maxMove * progress}px, 0, 0)`;
}

function updateHeroOutfit() {
  if (!beachHero || outfitLooks.length === 0) return;
  const heroTop = beachHero.offsetTop;
  const heroScrollable = Math.max(beachHero.offsetHeight - window.innerHeight, 1);
  const progress = clamp((window.scrollY - heroTop) / heroScrollable, 0, 1);
  const chapter = progress * outfitLooks.length;
  const chapterIndex = clamp(Math.floor(chapter), 0, outfitLooks.length - 1);
  const chapterProgress = chapter - chapterIndex;
  const transitionStart = 0.64;
  const blend = chapterIndex === outfitLooks.length - 1
    ? 0
    : clamp((chapterProgress - transitionStart) / (1 - transitionStart), 0, 1);
  const smoothBlend = blend * blend * (3 - 2 * blend);

  outfitLooks.forEach((look, index) => {
    let opacity = 0;
    if (index === chapterIndex) opacity = 1 - smoothBlend;
    if (index === chapterIndex + 1) opacity = smoothBlend;
    look.style.opacity = opacity.toFixed(3);
    look.style.transform = `translate3d(${(index - chapterIndex) * 14 * (1 - opacity)}px, ${8 * (1 - opacity)}px, 0) scale(${0.988 + opacity * 0.012})`;
    look.classList.toggle("is-active", opacity > 0.5);
  });

  const nextIndex = blend >= 0.5 ? Math.min(chapterIndex + 1, outfitLooks.length - 1) : chapterIndex;
  if (nextIndex !== activeOutfitIndex) {
    activeOutfitIndex = nextIndex;
    if (outfitCaption) {
      outfitCaption.style.opacity = "0";
      outfitCaption.style.transform = "translateX(-50%) translateY(8px)";
      window.setTimeout(() => {
        outfitCaption.textContent = outfitLooks[activeOutfitIndex]?.dataset.outfit || "";
        outfitCaption.style.opacity = "1";
        outfitCaption.style.transform = "translateX(-50%) translateY(0)";
      }, 260);
    }
  }
}

function updateHeroPointer(event) {
  if (!heroSticky || window.matchMedia("(pointer: coarse)").matches) return;
  const rect = heroSticky.getBoundingClientRect();
  const x = clamp((event.clientX - rect.left) / rect.width, 0, 1) * 2 - 1;
  const y = clamp((event.clientY - rect.top) / rect.height, 0, 1) * 2 - 1;
  heroSticky.style.setProperty("--hero-mouse-x", x.toFixed(3));
  heroSticky.style.setProperty("--hero-mouse-y", y.toFixed(3));
}

heroSticky?.addEventListener("pointermove", updateHeroPointer, { passive: true });
heroSticky?.addEventListener("pointerleave", () => {
  heroSticky.style.setProperty("--hero-mouse-x", "0");
  heroSticky.style.setProperty("--hero-mouse-y", "0");
});

function onScroll() {
  updateHeader();
  updateParallax();
  updateHeroOutfit();
  updateAssembly();
  updateHorizontalShowcase();
}

window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll);
onScroll();

const storyText = document.querySelector(".story-text");
document.querySelectorAll(".story-item").forEach((item) => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".story-item").forEach((entry) => entry.classList.remove("active"));
    item.classList.add("active");
    if (storyText) {
      storyText.style.opacity = "0";
      setTimeout(() => {
        storyText.textContent = item.dataset.story || "";
        storyText.style.opacity = "1";
      }, 160);
    }
  });
});

document.querySelectorAll(".wishlist").forEach((button) => {
  button.addEventListener("click", () => {
    button.classList.toggle("is-active");
    const icon = button.querySelector("svg");
    if (icon) icon.style.fill = button.classList.contains("is-active") ? "currentColor" : "none";
  });
});

const modal = document.querySelector(".quick-modal");
const modalTitle = document.querySelector("#modalTitle");
document.querySelectorAll(".quick-view").forEach((button) => {
  button.addEventListener("click", () => {
    if (modalTitle) modalTitle.textContent = button.dataset.product || "Malteaser Look";
    modal?.showModal();
    window.lucide?.createIcons();
  });
});

document.querySelector(".close-modal")?.addEventListener("click", () => modal?.close());
modal?.addEventListener("click", (event) => {
  if (event.target === modal) modal.close();
});

const productHero = document.querySelector(".product-hero-image");
const mainProductImage = document.querySelector("#mainProductImage");
document.querySelectorAll(".thumb").forEach((thumb) => {
  thumb.addEventListener("click", () => {
    document.querySelectorAll(".thumb").forEach((item) => item.classList.remove("active"));
    thumb.classList.add("active");
    productHero?.classList.add("is-changing");
    setTimeout(() => {
      if (mainProductImage) {
        mainProductImage.src = thumb.dataset.image || mainProductImage.src;
      }
      productHero?.classList.remove("is-changing");
    }, 180);
  });
});

document.querySelectorAll(".sizes button, .swatch").forEach((button) => {
  button.addEventListener("click", () => {
    const group = button.classList.contains("swatch") ? ".swatch" : ".sizes button";
    document.querySelectorAll(group).forEach((item) => {
      item.classList.remove("active");
      if (item.matches(".sizes button")) item.setAttribute("aria-pressed", "false");
    });
    button.classList.add("active");
    if (button.matches(".sizes button")) {
      button.setAttribute("aria-pressed", "true");
      const quantityOutput = button.closest("[data-product-detail]")?.querySelector("[data-quantity-value]");
      if (quantityOutput) {
        const max = Number(button.dataset.stock || 99);
        quantityOutput.dataset.max = max;
        if (Number(quantityOutput.value || quantityOutput.textContent) > max) {
          quantityOutput.value = max;
          quantityOutput.textContent = max;
        }
        const value = Number(quantityOutput.value || quantityOutput.textContent || 1);
        const decrease = quantityOutput.closest(".quantity-stepper")?.querySelector('[data-quantity-step="-1"]');
        const increase = quantityOutput.closest(".quantity-stepper")?.querySelector('[data-quantity-step="1"]');
        if (decrease) decrease.disabled = value <= 1;
        if (increase) increase.disabled = value >= max;
      }
    }
  });
});

const cursorDot = document.querySelector(".cursor-dot");
const cursorRing = document.querySelector(".cursor-ring");
let mouseX = 0;
let mouseY = 0;
let ringX = 0;
let ringY = 0;

if (window.matchMedia("(pointer: fine)").matches && cursorDot && cursorRing) {
  window.addEventListener("mousemove", (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    cursorDot.style.opacity = "1";
    cursorRing.style.opacity = "1";
    cursorDot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
  });

  const animateCursor = () => {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    cursorRing.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
    requestAnimationFrame(animateCursor);
  };
  animateCursor();

  document.querySelectorAll("a, button, .product-card, .category-tile").forEach((item) => {
    item.addEventListener("mouseenter", () => cursorRing.classList.add("is-active"));
    item.addEventListener("mouseleave", () => cursorRing.classList.remove("is-active"));
  });
}

document.querySelectorAll(".magnetic").forEach((button) => {
  button.addEventListener("mousemove", (event) => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const rect = button.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    button.style.transform = `translate(${x * 0.12}px, ${y * 0.22}px)`;
  });

  button.addEventListener("mouseleave", () => {
    button.style.transform = "";
  });
});

document.querySelectorAll("[data-demo-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    const enquiries = JSON.parse(localStorage.getItem("malteaser_enquiries") || "[]");
    enquiries.unshift({
      ...values,
      type: location.pathname.includes("bulk-enquiry") ? "Bulk enquiry" : "Contact enquiry",
      created_at: new Date().toISOString()
    });
    localStorage.setItem("malteaser_enquiries", JSON.stringify(enquiries));
    form.reset();
    const message = form.querySelector("[data-demo-message]");
    if (message) {
      message.textContent = "Thank you. Your enquiry has been recorded for the Malteaser team.";
      message.dataset.type = "success";
    }
  });
});
