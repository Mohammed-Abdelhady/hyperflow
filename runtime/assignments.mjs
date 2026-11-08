import { catalogEfforts, effortLevel, selectReviewAssignments } from './review-policy.mjs';

export function validateAssignments(workflow, configuration, catalog) {
  const profiles = configuration.roles ?? configuration;
  const assignments = selectReviewAssignments(configuration, catalog);
  for (const [field, value] of [['securityReviewEffort', workflow.securityReviewEffort ?? 'high'], ['securityFixEffort', workflow.securityFixEffort ?? 'high']]) {
    effortLevel(value, `workflow.${field}`);
    if (!catalogEfforts(catalog, assignments.security.model).includes(value)) {
      throw new Error(`workflow.${field} ${value} is not supported by the general security reviewer ${assignments.security.model.adapter}/${assignments.security.model.model}`);
    }
  }
  for (const task of workflow.tasks) {
    const profile = profiles[task.agentRole];
    if (!profile) throw new Error(`Task ${task.id} uses an unconfigured agent profile: ${task.agentRole}`);
    const difficulty = task.difficulty ?? 'routine';
    const requiredRole = difficulty === 'routine' ? 'lightweight' : 'general';
    if (task.agentRole !== requiredRole) throw new Error(`Task ${task.id} routes ${difficulty} work to ${task.agentRole}; the contract requires ${requiredRole}`);
    effortLevel(task.effort, `Task ${task.id} implementation effort`);
    if (!catalogEfforts(catalog, profile).includes(task.effort)) {
      throw new Error(`Task ${task.id} implementation effort ${task.effort} is not supported by ${profile.adapter}/${profile.model}`);
    }
    if (task.reviewRole !== 'primary') throw new Error(`Task ${task.id} correctness-review requires the primary reviewer; found ${task.reviewRole ?? 'no reviewRole'}`);
    const reviewEffort = task.reviewEffort ?? 'high';
    effortLevel(reviewEffort, `Task ${task.id} correctness-review effort`);
    const reviewer = assignments.correctness.model;
    if (!catalogEfforts(catalog, reviewer).includes(reviewEffort)) {
      throw new Error(`Task ${task.id} correctness-review effort ${reviewEffort} is not supported by the primary reviewer ${reviewer.adapter}/${reviewer.model}`);
    }
  }
}

export { selectReviewAssignment, selectReviewAssignments } from './review-policy.mjs';
