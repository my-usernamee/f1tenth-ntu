const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const componentRows = document.querySelectorAll(".component-row");
const carParts = document.querySelectorAll(".car-part");

navToggle?.addEventListener("click", () => {
  const isOpen = siteNav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(isOpen));
});

siteNav?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    siteNav.classList.remove("is-open");
    navToggle?.setAttribute("aria-expanded", "false");
  }
});

const setActivePart = (partName) => {
  componentRows.forEach((row) => {
    row.classList.toggle("is-active", row.dataset.part === partName);
  });

  carParts.forEach((part) => {
    part.classList.toggle("is-highlighted", part.dataset.part === partName);
  });
};

componentRows.forEach((row) => {
  const partName = row.dataset.part;

  row.addEventListener("mouseenter", () => setActivePart(partName));
  row.addEventListener("focus", () => setActivePart(partName));
  row.addEventListener("click", () => setActivePart(partName));
});

carParts.forEach((part) => {
  const partName = part.dataset.part;

  part.addEventListener("mouseenter", () => setActivePart(partName));
  part.addEventListener("focus", () => setActivePart(partName));
  part.addEventListener("click", () => setActivePart(partName));
});

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

window.addEventListener("load", () => {
  if (prefersReducedMotion || !window.gsap) {
    setActivePart("lidar");
    return;
  }

  const { gsap } = window;

  if (window.ScrollTrigger) {
    gsap.registerPlugin(window.ScrollTrigger);
  }

  gsap.from(".site-header", {
    y: -24,
    opacity: 0,
    duration: 0.7,
    ease: "power3.out",
  });

  gsap.from(".hero-logo, .race-label, h1, .hero-text, .hero-actions", {
    y: 28,
    opacity: 0,
    duration: 0.8,
    stagger: 0.08,
    ease: "power3.out",
  });

  gsap.from(".hero-car", {
    x: 140,
    y: 60,
    rotate: -18,
    opacity: 0,
    duration: 1.1,
    ease: "expo.out",
    delay: 0.25,
  });

  gsap.to(".hero-car", {
    y: -10,
    duration: 2.2,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });

  gsap.to(".speed-line", {
    x: (index) => (index % 2 ? -180 : 180),
    duration: 2.8,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
    stagger: 0.25,
  });

  gsap.to(".track-ring", {
    rotate: "+=360",
    duration: 32,
    repeat: -1,
    ease: "none",
    stagger: 6,
  });

  gsap.from(".intro-card, .garage-grid article, .events-strip article", {
    scrollTrigger: {
      trigger: ".intro-grid",
      start: "top 78%",
    },
    y: 36,
    opacity: 0,
    duration: 0.72,
    stagger: 0.07,
    ease: "power3.out",
  });

  gsap.from(".car-part", {
    scrollTrigger: {
      trigger: ".car-lab",
      start: "top 62%",
      toggleActions: "play none none reverse",
    },
    x: (index) => [-120, 120, -90, 100, -80, 80, 0, -70, 70, -70, 70][index] || 0,
    y: (index) => [-100, -100, -60, 90, 90, -70, 0, -80, -80, 90, 90][index] || 0,
    rotate: (index) => [-12, 10, -8, 7, -9, 9, 0, -18, 18, 18, -18][index] || 0,
    opacity: 0,
    scale: 0.86,
    duration: 0.95,
    stagger: 0.06,
    ease: "back.out(1.35)",
    onComplete: () => setActivePart("lidar"),
  });

  gsap.to(".scan-beam", {
    rotate: 20,
    transformOrigin: "0% 100%",
    duration: 1.6,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut",
  });

  gsap.from(".results-grid article", {
    scrollTrigger: {
      trigger: ".results",
      start: "top 68%",
    },
    y: 32,
    opacity: 0,
    duration: 0.65,
    stagger: 0.08,
    ease: "power3.out",
  });
});
