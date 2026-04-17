document.querySelectorAll('[data-guest-link="true"]').forEach((link) => {
  link.addEventListener("click", () => {
    try {
      localStorage.setItem("mkwt_mode", "guest");
      localStorage.setItem("mkwt_last_mode", "guest");
    } catch (e) {}
  });
});
