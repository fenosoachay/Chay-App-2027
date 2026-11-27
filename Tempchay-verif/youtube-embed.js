// Relais du lecteur YouTube pour l'APK Église Chay (voir docs/YOUTUBE-APK.md).
// - ne répond qu'à la page parente autorisée (paramètre ?parent=, liste fermée) ;
// - n'exécute que 4 commandes (lecture, pause, arrêt, avance) ;
// - renvoie au parent les mêmes messages que l'iframe YouTube directe (onStateChange, infoDelivery)
//   plus « ready » et « onError » (vidéo dont l'intégration est interdite, introuvable, API injoignable).
(function relaisYoutube(win, doc) {
  "use strict";
  var PARENTS_AUTORISES = ["https://localhost", "http://localhost", "capacitor://localhost", "https://membres.chay.fr"];
  var COMMANDES = { playVideo: 0, pauseVideo: 0, stopVideo: 0, seekTo: 2 };
  var params = new URLSearchParams(win.location.search);
  var videoId = params.get("v") || "";
  var parent = params.get("parent") || "";
  var lecteur = null;
  var minuterie = null;

  function afficher(texte) {
    var el = doc.getElementById("message");
    if (!el) return;
    el.textContent = texte;
    el.style.display = "flex";
  }

  if (PARENTS_AUTORISES.indexOf(parent) < 0 || win.parent === win) {
    afficher("Lecteur réservé à l'application Église Chay.");
    return;
  }
  function envoyer(message) {
    win.parent.postMessage(JSON.stringify(message), parent);
  }
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) {
    envoyer({ event: "onError", info: 2 });
    return;
  }

  function infos() {
    if (!lecteur || typeof lecteur.getCurrentTime !== "function") return;
    envoyer({
      event: "infoDelivery",
      info: { currentTime: lecteur.getCurrentTime(), duration: lecteur.getDuration(), playerState: lecteur.getPlayerState() },
    });
  }

  win.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
    lecteur = new win.YT.Player("lecteur", {
      host: "https://www.youtube-nocookie.com",
      videoId: videoId,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0, origin: win.location.origin },
      events: {
        onReady: function onReady() {
          envoyer({ event: "ready" });
          lecteur.playVideo();
          if (!minuterie) minuterie = win.setInterval(infos, 1000);
        },
        onStateChange: function onStateChange(e) {
          envoyer({ event: "onStateChange", info: e.data });
        },
        onError: function onError(e) {
          envoyer({ event: "onError", info: e.data });
        },
      },
    });
  };

  win.addEventListener("message", function onMessage(event) {
    if (event.origin !== parent || event.source !== win.parent) return;
    var data = event.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (!data || data.event !== "command" || !lecteur || !Object.prototype.hasOwnProperty.call(COMMANDES, data.func)) return;
    var args = Array.isArray(data.args) ? data.args.slice(0, COMMANDES[data.func]) : [];
    if (data.func === "seekTo" && !(Number(args[0]) >= 0)) return;
    lecteur[data.func].apply(lecteur, args);
  });

  var script = doc.createElement("script");
  script.src = "https://www.youtube.com/iframe_api";
  script.onerror = function onApiError() { envoyer({ event: "onError", info: "api" }); };
  doc.head.appendChild(script);
})(window, document);
