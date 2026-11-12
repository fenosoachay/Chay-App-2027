import { isISODate, toISODate } from "./localDate.js";

export function meetingDateOf(event) {
  return event.event_date || event.date;
}

export const HEURE_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Heure de la réunion (HH:MM) ou "" (réunion créée avant 1.3.6). */
export const heureReunion = (event) => (HEURE_RE.test(String(event?.event_time || "")) ? event.event_time : "");

/** « à 18:30 » -> « 18 h 30 » (affichage). */
export const formatHeure = (hhmm) => (HEURE_RE.test(hhmm || "") ? hhmm.replace(":", " h ") : "");

/**
 * Réunions à venir : non archivées, et dont l'heure n'est pas encore passée aujourd'hui (la tâche serveur
 * les archive ensuite ; ici elles disparaissent tout de suite). `now` = heure locale de l'appareil.
 */
export function upcomingEvents(events, today = toISODate(), now = new Date()) {
  const maintenant = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return events
    .filter((event) => {
      if (event.archived === true) return false;
      if (!isISODate(event.date)) return false;
      const heure = heureReunion(event);
      if (heure && meetingDateOf(event) === today && heure <= maintenant) return false;
      const meetingDate = meetingDateOf(event);
      return isISODate(meetingDate) &&
        meetingDate >= today &&
        (!event.event_date || event.date <= today);
    })
    .sort((a, b) => {
      const meetingDateDiff = meetingDateOf(a).localeCompare(meetingDateOf(b));
      if (meetingDateDiff !== 0) return meetingDateDiff;
      // Même jour : par heure (réunions sans heure en dernier).
      const heureDiff = (heureReunion(a) || "99:99").localeCompare(heureReunion(b) || "99:99");
      if (heureDiff !== 0) return heureDiff;
      const publicationDateDiff = a.date.localeCompare(b.date);
      if (publicationDateDiff !== 0) return publicationDateDiff;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
}
