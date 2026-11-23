// Indications de schéma utilisées par la couche d'adaptation PocketBase.
// Générées à partir de base44/entities/*.jsonc (à régénérer si le schéma change).

// Champs `format: "date"` (date seule) : Base44 renvoyait "AAAA-MM-JJ",
// PocketBase stocke "AAAA-MM-JJ 00:00:00.000Z".
export const DATE_ONLY_FIELDS = {
  Announcement: ['date', 'event_date'],
  Devotional: ['reading_date'],
  QuestionLogique: ['date'],
  Sermon: ['date'],
  SiteCulte: ['date'],
  User: ['birth_date', 'conversion_date', 'baptism_date'],
};

// Champs tableau (stockés en json dans PocketBase). Une égalité Base44
// `{ champ: valeur }` sur un tableau signifie « le tableau contient la valeur ».
export const ARRAY_FIELDS = {
  CommunityPost: ['image_urls'],
  Conversation: ['participant_ids', 'pinned_by', 'muted_by'],
  EmojiQuizQuestion: ['options'],
  Message: ['participant_ids', 'read_by'],
  PersonalityQuizProfile: ['image_history', 'qualities', 'growth_areas'],
  PersonalityQuizQuestion: ['answers'],
  PuzzleImage: ['image_history'],
  QuizImport: ['category_values'],
  QuizUserProgress: ['session_question_ids', 'session_answered_ids'],
  UploadSession: ['uploaded_indices'],
  Video: ['viewed_by'],
  WordScrambleImport: ['category_values'],
  WordScrambleProgress: ['session_word_ids'],
};

export const isDateOnlyField = (entity, field) => Boolean(DATE_ONLY_FIELDS[entity]?.includes(field));
export const isArrayField = (entity, field) => Boolean(ARRAY_FIELDS[entity]?.includes(field));
