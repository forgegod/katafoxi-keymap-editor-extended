/* Apply scheme before CSS so the first paint matches preference. */
;(function () {
  try {
    var pref = localStorage.getItem('color-scheme-preference')
    var scheme = pref === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.colorScheme = scheme
    document.documentElement.style.colorScheme = scheme
  } catch (e) {}
})()
