window.MKWTStatsUI = (function(){
  const INFO_TEXTS = {
    vrHistory: {
      title: "VR History",
      body: "Shows how your VR changed after each race. Use the filter to view all races, the last month, or the last week."
    },
    performance: {
      title: "Performance",
      body: "Shows where you gain the most VR. Destiny keeps special variants separate, and Special shows only those variant endings."
    },
    trackDistribution: {
      title: "Tracks & Intermissions",
      body: "Separates regular tracks from intermissions, so you can compare how often each type appears and how your average VR and win rate look for each side."
    },
    buckets: {
      title: "VR Performance Sweetspot",
      body: "Tries to estimate your average VR level from World Wide results. Switch between Overall, Tracks, and Intermission to see what your VR could look like if World Wides only played that type."
    },
    weekly: {
      title: "VR History (Weekly)",
      body: "Shows your VR by week. Choose average VR or average gain to see the trend more calmly."
    },
    modeCompare: {
      title: "Mode Compare",
      body: "Compares shared tracks between World Wides and Lounge 12p. When both colored bars are high and even, you are strong and consistent on that track in both modes. If one side is much lower, review that track in that mode and look for what feels different."
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
