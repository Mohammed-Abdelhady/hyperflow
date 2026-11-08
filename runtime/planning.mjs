import { validateWorkflow } from './workflow.mjs';

function copyWorkflowFields(input, stripAnswers = false) {
  const questions = Array.isArray(input.questions) ? input.questions.map((question) => {
    if (!stripAnswers || !question || typeof question !== 'object' || Array.isArray(question)) return question;
    const draft = { ...question };
    delete draft.answer;
    return draft;
  }) : input.questions ?? [];
  return validateWorkflow({
    schemaVersion: 1, id: input.id, goal: input.goal, repository: input.repository,
    tasks: input.tasks, questions, decisions: input.decisions ?? [],
  });
}

export function createPlan(input) {
  const workflow = copyWorkflowFields(input, true);
  return { ...workflow, explicitUserParticipation: false };
}

export function pendingQuestions(plan) {
  const workflow = copyWorkflowFields(plan);
  const answered = new Set(workflow.questions.filter((question) => question.answer).map((question) => question.id));
  return workflow.questions.filter((question) => !question.answer && (question.dependsOn ?? []).every((id) => answered.has(id)));
}

export function answerQuestions(plan, response) {
  if (!plan || typeof plan !== 'object' || !response || typeof response !== 'object' || response.confirmed !== true) throw new TypeError('Explicit user confirmation is required');
  const workflow = copyWorkflowFields(plan);
  const answers = response.answers ?? {};
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new TypeError('Answers must be an object');
  const known = new Set(workflow.questions.map((question) => question.id));
  const pending = new Set(pendingQuestions(workflow).map((question) => question.id));
  for (const id of Object.keys(answers)) {
    if (!known.has(id)) throw new TypeError(`Unknown question: ${id}`);
    if (!pending.has(id)) throw new TypeError(`Question prerequisites are not settled for ${id}`);
  }
  const questions = workflow.questions.map((question) => {
    const answer = answers[question.id] ?? question.answer;
    if (answer !== undefined && (typeof answer !== 'string' || !answer.trim())) throw new TypeError(`Answer for ${question.id} must be actual nonempty text`);
    return answer === undefined ? question : { ...question, answer: answer.trim() };
  });
  return { ...workflow, questions, explicitUserParticipation: true };
}

export function compilePlan(plan) {
  if (!plan || plan.explicitUserParticipation !== true) throw new TypeError('Explicit user participation is required before compilation');
  const workflow = copyWorkflowFields(plan);
  const unanswered = workflow.questions.filter((question) => question.blocking && !question.answer);
  if (unanswered.length) throw new TypeError(`Blocking questions remain unanswered: ${unanswered.map((question) => question.id).join(', ')}`);
  const answers = workflow.questions.filter((question) => question.answer).map((question) => ({ id: `answer-${question.id}`, text: question.answer, source: 'user' }));
  return validateWorkflow({ ...workflow, decisions: [...workflow.decisions, ...answers] });
}
