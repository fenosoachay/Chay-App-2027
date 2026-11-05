export const PERSONALITY_QUIZ_TITLE = "Quel personnage biblique te ressemble le plus ?";
export const PERSONALITY_QUIZ_SUBTITLE =
  "Réponds spontanément à 10 questions et découvre le personnage biblique dont le parcours présente le plus de ressemblances avec tes réponses.";
export const PERSONALITY_QUIZ_QUESTION_COUNT = 10;

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const MAX_SCORE = 5;

function cleanText(value, maxLength = 1000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanList(value, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 180)).filter(Boolean))].slice(0, maxItems);
}

export function cleanPersonalityQuestion(raw, knownProfileIds = []) {
  if (!raw || typeof raw !== "object") return null;
  const contentId = cleanText(raw.content_id, 80).toLowerCase();
  const question = cleanText(raw.question, 500);
  const sortOrder = Number(raw.sort_order);
  const answers = Array.isArray(raw.answers)
    ? raw.answers.map((answer) => {
      const answerId = cleanText(answer?.id, 80).toLowerCase();
      const text = cleanText(answer?.text, 500);
      const scores = {};
      if (answer?.scores && typeof answer.scores === "object" && !Array.isArray(answer.scores)) {
        Object.entries(answer.scores).forEach(([profileId, score]) => {
          const amount = Number(score);
          if (knownProfileIds.includes(profileId) && Number.isInteger(amount) && amount >= 1 && amount <= MAX_SCORE) {
            scores[profileId] = amount;
          }
        });
      }
      return { id: answerId, text, scores };
    })
    : [];
  if (
    !ID_PATTERN.test(contentId) ||
    !question ||
    !Number.isInteger(sortOrder) ||
    sortOrder < 1 ||
    typeof raw.is_active !== "boolean" ||
    answers.length !== 4 ||
    answers.some((answer) => !ID_PATTERN.test(answer.id) || !answer.text || !Object.keys(answer.scores).length) ||
    new Set(answers.map((answer) => answer.id)).size !== 4
  ) return null;
  return { content_id: contentId, sort_order: sortOrder, is_active: raw.is_active, question, answers };
}

export function cleanPersonalityProfile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const profile = {
    content_id: cleanText(raw.content_id, 80).toLowerCase(),
    sort_order: Number(raw.sort_order),
    is_active: raw.is_active,
    name: cleanText(raw.name, 100),
    image_url: cleanText(raw.image_url, 2000),
    image_history: Array.isArray(raw.image_history)
      ? [...new Set(raw.image_history.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url)))].slice(0, 20)
      : [],
    summary: cleanText(raw.summary, 1200),
    qualities: cleanList(raw.qualities),
    growth_areas: cleanList(raw.growth_areas),
    story: cleanText(raw.story, 2500),
    reference: cleanText(raw.reference, 120),
  };
  if (
    !ID_PATTERN.test(profile.content_id) ||
    !Number.isInteger(profile.sort_order) ||
    profile.sort_order < 1 ||
    typeof profile.is_active !== "boolean" ||
    !profile.name ||
    !profile.summary ||
    !profile.qualities.length ||
    !profile.growth_areas.length ||
    !profile.story ||
    !profile.reference ||
    (profile.image_url && !/^https?:\/\//i.test(profile.image_url))
  ) return null;
  return profile;
}

export function validatePersonalityQuizPackage(raw, knownProfileIds = []) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { errors: ["Le fichier doit contenir un objet JSON."], questions: [], profiles: [] };
  }
  if (!Array.isArray(raw.questions) || !Array.isArray(raw.profiles)) {
    return { errors: ["Le fichier doit contenir les listes « questions » et « profiles »."], questions: [], profiles: [] };
  }

  const profiles = raw.profiles.map(cleanPersonalityProfile);
  const invalidProfiles = profiles.filter((profile) => !profile).length;
  const validProfiles = profiles.filter(Boolean);
  if (invalidProfiles) errors.push(`${invalidProfiles} profil(s) invalide(s).`);
  const profileIds = validProfiles.map((profile) => profile.content_id);
  if (new Set(profileIds).size !== profileIds.length) errors.push("Les identifiants de profil doivent être uniques.");
  if (!validProfiles.length && !knownProfileIds.length) errors.push("Le fichier doit contenir au moins un profil.");

  const scoreProfileIds = [...new Set([...knownProfileIds, ...profileIds])];
  const questions = raw.questions.map((question) => cleanPersonalityQuestion(question, scoreProfileIds));
  const invalidQuestions = questions.filter((question) => !question).length;
  const validQuestions = questions.filter(Boolean);
  if (invalidQuestions) errors.push(`${invalidQuestions} question(s) invalide(s) : chaque question exige quatre réponses avec des points valides.`);
  const questionIds = validQuestions.map((question) => question.content_id);
  if (new Set(questionIds).size !== questionIds.length) errors.push("Les identifiants de question doivent être uniques.");
  if (!validQuestions.length) errors.push("Le fichier doit contenir au moins une question.");
  return { errors, questions: validQuestions, profiles: validProfiles };
}

export function evaluatePersonalityQuiz(questions, profiles, selectedAnswers) {
  const activeProfiles = profiles
    .filter((profile) => profile.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.content_id.localeCompare(b.content_id));
  const scores = Object.fromEntries(activeProfiles.map((profile) => [profile.content_id, 0]));
  const reasons = Object.fromEntries(activeProfiles.map((profile) => [profile.content_id, []]));

  for (const question of questions) {
    const answerId = selectedAnswers[question.content_id];
    const answer = question.answers.find((item) => item.id === answerId);
    if (!answer) return null;
    for (const [profileId, points] of Object.entries(answer.scores)) {
      if (!(profileId in scores)) continue;
      scores[profileId] += points;
      reasons[profileId].push({ question: question.question, answer: answer.text, points });
    }
  }

  const ranked = [...activeProfiles].sort((a, b) => (
    scores[b.content_id] - scores[a.content_id] ||
    a.sort_order - b.sort_order ||
    a.content_id.localeCompare(b.content_id)
  ));
  if (!ranked.length) return null;
  const primary = ranked[0];
  const second = ranked[1];
  return {
    primary,
    secondary: second && scores[primary.content_id] - scores[second.content_id] <= 1 ? second : null,
    scores,
    reasons: reasons[primary.content_id].sort((a, b) => b.points - a.points).slice(0, 3),
  };
}

function escapeCsv(value) {
  const text = typeof value === "string" ? value : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportPersonalityQuizCsv({ questions, profiles }) {
  const header = [
    "record_type", "content_id", "sort_order", "is_active", "question", "answers_json",
    "name", "image_url", "image_history_json", "summary", "qualities_json", "growth_areas_json", "story", "reference",
  ];
  const rows = [
    ...questions.map((item) => [
      "question", item.content_id, item.sort_order, item.is_active, item.question,
      JSON.stringify(item.answers),       "", "", "", "", "", "", "", "",
    ]),
    ...profiles.map((item) => [
      "profile", item.content_id, item.sort_order, item.is_active, "",
      "", item.name, item.image_url || "", JSON.stringify(item.image_history || []), item.summary, JSON.stringify(item.qualities),
      JSON.stringify(item.growth_areas), item.story, item.reference,
    ]),
  ];
  return [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
}

export function parsePersonalityQuizCsv(source) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const text = String(source || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("Le CSV contient un champ entre guillemets qui n'est pas terminé.");
  if (field || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }
  if (rows.length < 2) throw new Error("Le CSV ne contient aucune ligne de données.");

  const header = rows[0].map((cell) => cell.trim());
  if (new Set(header).size !== header.length || !header.includes("record_type") || !header.includes("content_id")) {
    throw new Error("En-têtes CSV invalides. Exportez d'abord un modèle depuis le panneau d'administration.");
  }
  const records = rows.slice(1).map((cells, index) => {
    if (cells.length !== header.length) throw new Error(`Ligne ${index + 2} : nombre de colonnes incorrect.`);
    return Object.fromEntries(header.map((key, cellIndex) => [key, cells[cellIndex]]));
  });
  const questions = [];
  const profiles = [];
  for (const [index, item] of records.entries()) {
    const line = index + 2;
    const active = item.is_active === "true" || item.is_active === "1";
    if (!["true", "false", "1", "0"].includes(item.is_active)) {
      throw new Error(`Ligne ${line} : « is_active » doit être true ou false.`);
    }
    if (item.record_type === "question") {
      let answers;
      try { answers = JSON.parse(item.answers_json); } catch {
        throw new Error(`Ligne ${line} : « answers_json » n'est pas un JSON valide.`);
      }
      questions.push({
        content_id: item.content_id,
        sort_order: Number(item.sort_order),
        is_active: active,
        question: item.question,
        answers,
      });
    } else if (item.record_type === "profile") {
      let qualities;
      let growthAreas;
      let imageHistory = [];
      try {
        qualities = JSON.parse(item.qualities_json);
        growthAreas = JSON.parse(item.growth_areas_json);
        if (item.image_history_json) imageHistory = JSON.parse(item.image_history_json);
      } catch {
        throw new Error(`Ligne ${line} : les listes ou l'historique d'images doivent être des JSON valides.`);
      }
      profiles.push({
        content_id: item.content_id,
        sort_order: Number(item.sort_order),
        is_active: active,
        name: item.name,
        image_url: item.image_url,
        image_history: imageHistory,
        summary: item.summary,
        qualities,
        growth_areas: growthAreas,
        story: item.story,
        reference: item.reference,
      });
    } else {
      throw new Error(`Ligne ${line} : « record_type » doit être question ou profile.`);
    }
  }
  return { title: PERSONALITY_QUIZ_TITLE, language: "fr", questions, profiles };
}
