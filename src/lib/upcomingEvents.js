import { isISODate, toISODate } from "./localDate.js";

export function meetingDateOf(event) {
  return event.event_date || event.date;
}

export function upcomingEvents(events, today = toISODate()) {
  return events
    .filter((event) => {
      if (!isISODate(event.date)) return false;
      const meetingDate = meetingDateOf(event);
      return isISODate(meetingDate) &&
        meetingDate >= today &&
        (!event.event_date || event.date <= today);
    })
    .sort((a, b) => {
      const meetingDateDiff = meetingDateOf(a).localeCompare(meetingDateOf(b));
      if (meetingDateDiff !== 0) return meetingDateDiff;
      const publicationDateDiff = a.date.localeCompare(b.date);
      if (publicationDateDiff !== 0) return publicationDateDiff;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
}
