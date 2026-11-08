export function validateAssignments(workflow, configuration, catalog) {
  const profiles = configuration.roles ?? configuration;
  for (const task of workflow.tasks) {
    const profile = profiles[task.agentRole];
    if (!profile) throw new Error(`Task ${task.id} uses an unconfigured agent profile: ${task.agentRole}`);
    const descriptor = catalog.find((entry) => entry.adapter === profile.adapter && entry.id === profile.model);
    if (!descriptor) throw new Error(`Task ${task.id} uses an unavailable harness/model`);
    if (typeof task.effort !== 'string' || (descriptor.effortSupport === 'unknown'
      ? !descriptor.acceptedEffortTokens?.includes(task.effort) : !descriptor.variants?.includes(task.effort))) {
      throw new Error(`Task ${task.id} has an unsupported planned effort for ${profile.adapter}/${profile.model}`);
    }
    const reviewRole = task.reviewRole ?? Object.keys(profiles).find((role) => role !== task.agentRole) ?? task.agentRole;
    const reviewer = profiles[reviewRole];
    const reviewDescriptor = reviewer && catalog.find((entry) => entry.adapter === reviewer.adapter && entry.id === reviewer.model);
    if (!reviewDescriptor || (reviewDescriptor.effortSupport === 'unknown'
      ? !reviewDescriptor.acceptedEffortTokens?.includes(task.reviewEffort ?? task.effort)
      : !reviewDescriptor.variants?.includes(task.reviewEffort ?? task.effort))) {
      throw new Error(`Task ${task.id} has an unavailable reviewer or unsupported planned review effort`);
    }
  }
}

export function selectReviewAssignment(configuration, catalog) {
  const profiles = configuration.roles ?? configuration;
  const role = ['general', 'primary', 'lightweight', ...Object.keys(profiles)].find((key) => profiles[key]);
  const model = profiles[role];
  const descriptor = model && catalog.find((entry) => entry.adapter === model.adapter && entry.id === model.model);
  const efforts = descriptor?.effortSupport === 'unknown' ? descriptor.acceptedEffortTokens : descriptor?.variants;
  const effort = ['high', 'medium', 'low', 'harness-default', ...(efforts ?? [])].find((value) => efforts?.includes(value));
  if (!model || !effort) throw new Error('No configured reviewer with a supported effort is available');
  return { role, model, effort };
}
