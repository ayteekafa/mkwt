window.MKWTStatsUI = (function(){
  const INFO_TEXTS = {
    vrHistory: {
      title: "VR History",
      body: "This chart shows your VR over time, ordered by match number (X-axis), with VR on the Y-axis. Use it to spot trends, streaks, and turning points in your progression. The line reflects your raw VR after each match, so sharp steps usually mean big gains or losses. The window buttons (Overall / Last month / Last week) filter which matches are included, and the ‘Avg VR’ below updates to that selected window."
    },
    performance: {
      title: "Performance",
      body: "This is a per-track (or per-intermission) performance ranking. Each bar summarizes how well you perform on that item across your stored matches, combining average VR gain and win rate. First pick the mode at the top (Tracks vs Intermission Destiny vs Intermission Separated). Then apply a sort (Average gain, Win rate, Times played, A–Z); clicking the same sort again reverses the order. Tap a bar to see the details line for the selected item."
    },
    trackDistribution: {
      title: "Track Distribution",
      body: "This pie chart shows how your matches split between Tracks and Intermission. It helps you understand what you have actually been playing and how that affects your stats. Use the time-window buttons (Overall / Last month / Last week) to filter which matches are counted. The three summary cards below update with the selected window and show Avg VR and Win rate for Matches, Tracks, and Intermission separately."
    },
    buckets: {
      title: "VR Performance Sweetspot",
      body: "This chart shows how you perform below vs. above your own average VR. Matches are grouped into VR-before buckets around your average VR — the 0 bucket represents your average VR baseline.\n\nLeft buckets = matches played under your average, right buckets = over your average. Bar height is your average VR gain in that bucket.\n\nUse Overall / Track only / Intermission only to compare both types and estimate what VR level you’d likely stabilize at if you played only Tracks or only Intermission. This chart needs many matches to be representative."
    },
    weekly: {
      title: "VR History (Weekly)",
      body: "This chart aggregates your data by week to smooth out daily noise. In ‘VR Average’ mode, each bar represents your average VR for that week. In ‘VR Gain Avg’ mode, it shows your weekly average VR gain split by Tracks vs Intermission so you can compare them at a glance. The toggle buttons switch the mode, and tapping a bar pins the details (especially on mobile)."
    }
  };

  const overlayApi = window.MKWT?.bindInfoOverlay?.({
    texts: INFO_TEXTS,
    titleFallback: 'Info'
  }) || {};

  return {
    openInfo: overlayApi.openInfo || function(){},
    closeInfo: overlayApi.closeInfo || function(){}
  };
})();
