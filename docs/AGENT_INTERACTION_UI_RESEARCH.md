# Agent interaction UI research

The studio needs a judge to understand one real creative run: who produced each reply, what the next agent received, how a counteroffer changed the proposed share, and which shares became authoritative for a release. The UI uses the saved model outputs and published contract shares. The agents exchange data through the workflow; they do not maintain a direct chat channel.

## References and decisions

| Reference | Useful pattern | Studio decision |
| --- | --- | --- |
| [LangSmith trace viewer](https://docs.langchain.com/langsmith/view-traces) | A readable trajectory with expandable details for each step | Put the conversation first; keep full reply, model, and output hash one click away |
| [Honeycomb Agent Timeline](https://www.honeycomb.io/platform/agent-timeline) | Chronological agent handoffs with drill-down | Number the saved replies and show the workflow handoff after each one |
| [NegMAS App](https://github.com/autoneg/negmas-app) | Proposal history and agreement markers | Show each proposed, countered, and accepted split as a proportional bar |
| [QT Handshake](https://tflowx.com/docs/app/qt-handshake) | Distinct counteroffer and accepted terms | Make the counteroffer legible, then separate saved workflow agreement from on-chain release shares |

## Truth and display rules

- Only display replies read from verified saved model outputs. Public release replies are linked by hashes in release metadata; older concepts are labeled separately.
- The shared panel appears in the live guest session and on the published song's collaboration page.
- Offer percentages are parsed from validated integer basis points that sum to 10,000. A workflow agreement requires a matching saved acceptance. Published on-chain shares take priority on the public page.
- Replay reveals existing replies. It does not simulate new agent messages or imply that agents have a direct messaging channel.
