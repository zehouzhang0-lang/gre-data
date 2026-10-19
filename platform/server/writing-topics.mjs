// Original teaching exercises, not ETS questions or an imported official pool.
export const writingResources = {
  overview: "https://www.ets.org/gre/test-takers/general-test/prepare/content/analytical-writing.html",
  issue: "https://www.ets.org/gre/test-takers/general-test/prepare/content/analytical-writing/issue.html",
  pool: "https://globalhighered.ets.org/gre-issue-topic-tool",
  scoring: "https://www.ets.org/gre/test-takers/general-test/prepare/content/analytical-writing/scoring.html",
  checked_at: "2026-10-19",
};

export const writingTopics = [
  {
    id: "coach_issue_feedback_01", title: "学习中的反馈与独立思考", theme: "教育与学习",
    prompt: "Students learn more from revising an imperfect answer on their own than from receiving an excellent answer immediately.",
    instructions: "Develop a position on this claim. Explain when independent revision is useful and when direct guidance might be more useful. Use reasons and concrete examples to connect these circumstances to your conclusion.",
    translation: "题目：与立即获得一个出色答案相比，学生通过独立修改一个不完善的答案能够学到更多。\n任务：就这一主张形成自己的立场。解释独立修改在什么情况下有帮助，以及直接指导在什么情况下可能更有帮助。用理由和具体例子说明这些情况如何支持你的结论。",
  },
  {
    id: "coach_issue_transparency_02", title: "领导者是否应该公开决策失误", theme: "领导与社会",
    prompt: "A public institution earns lasting trust by explaining its failed decisions as openly as its successful ones.",
    instructions: "Assess this claim and defend your judgment. Examine a serious objection to openness, and explain whether that objection changes your position. Support your reasoning with a specific real or hypothetical situation.",
    translation: "题目：公共机构像解释成功决策一样坦诚地解释失败决策，才能赢得持久的信任。\n任务：评价这一主张并论证自己的判断。分析一种反对公开信息的有力理由，说明它是否改变你的立场。用一个具体的真实或假设情境支持推理。",
  },
  {
    id: "coach_issue_ai_03", title: "工具便利与基础能力", theme: "科技与生活",
    prompt: "When a tool can perform a routine task reliably, schools should spend less time teaching students to perform that task without the tool.",
    instructions: "Argue for a qualified or unqualified position on this proposal. Compare its effects on beginners and experienced users. Explain which consequences matter most to your decision, using relevant examples.",
    translation: "题目：当一种工具能够可靠地完成某项常规任务时，学校应减少教授学生在不使用该工具的情况下完成该任务的时间。\n任务：提出带有限定或不带限定的立场。比较这一建议对初学者和熟练使用者的影响。结合相关例子，解释哪些后果对你的判断最重要。",
  },
  {
    id: "coach_issue_public_space_04", title: "公共空间的投入取舍", theme: "公共政策",
    prompt: "A city with a limited cultural budget should improve free neighborhood gathering places before building a prestigious new museum.",
    instructions: "Evaluate this spending priority. Consider both the residents who would benefit and the opportunities the city might lose. Explain the conditions under which your preferred choice would change.",
    translation: "题目：文化预算有限的城市，应先改善免费的社区聚会场所，再建设一座有声望的新博物馆。\n任务：评价这一支出优先次序。既考虑受益的居民，也考虑城市可能失去的机会。解释在什么条件下你会改变自己的选择。",
  },
  {
    id: "coach_issue_research_05", title: "科研的近期用途与长期价值", theme: "科学与知识",
    prompt: "One view holds that a research team's immediate practical results are the best measure of its value. Another holds that its contribution to future investigations matters more.",
    instructions: "Compare these two standards and explain your own position. Address the strengths and limitations of each, and show how your judgment applies to a concrete research situation.",
    translation: "题目：一种观点认为，科研团队的即时实用成果最能衡量其价值；另一种观点认为，它对未来研究的贡献更加重要。\n任务：比较这两种标准并解释自己的立场。回应每一种标准的优点和局限，说明你的判断如何适用于一个具体科研情境。",
  },
  {
    id: "coach_issue_environment_06", title: "环保措施与个人选择", theme: "环境与责任",
    prompt: "Environmental policies are more durable when they make responsible choices convenient than when they rely mainly on penalties.",
    instructions: "Examine the claim and the assumption about human behavior behind it. Present a reasoned judgment, using examples that test both the usefulness and the limits of the proposed approach.",
    translation: "题目：与主要依赖惩罚相比，使负责任的选择更加便利，能够让环境政策更持久。\n任务：考察这一主张及其背后有关人类行为的假设。用能检验该方法作用和局限的例子，提出有理由支持的判断。",
  },
].map(topic => ({ ...topic, source_kind: "coach_original", source_url: "" }));
