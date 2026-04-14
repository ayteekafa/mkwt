// Ensure “Try as Guest” is an explicit choice.
    document.getElementById('tryGuest')?.addEventListener('click', () => {
      try {
        localStorage.setItem('mkwt_mode', 'guest');
        localStorage.setItem('mkwt_last_mode', 'guest');
      } catch(e) {}
    });
