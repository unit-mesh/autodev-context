import { CoreMessage } from "ai";
import { ToolLike } from "../capabilities/_typing";
import { ToolDefinition, ToolResult } from "./tool-definition";
import { ProjectContextAnalyzer } from "../capabilities/tools/analyzers/project-context-analyzer";
import { configureLLMProvider, LLMProviderConfig } from "../services/llm";
import { LLMLogger } from "../services/llm/llm-logger";
import { generateText } from "ai";

export class PromptBuilder {
  private tools: ToolDefinition[] = [];
  private llmConfig: LLMProviderConfig;
  private logger: LLMLogger;

  constructor() {
    const llmConfig = configureLLMProvider();
    if (!llmConfig) {
      throw new Error('No LLM provider configured. Please set GLM_TOKEN, DEEPSEEK_TOKEN, or OPENAI_API_KEY');
    }
    this.llmConfig = llmConfig;
    this.logger = new LLMLogger('prompt-builder.log');
  }

  /**
   * Register available tools from MCP capabilities
   */
  registerTools(tools: ToolDefinition[]): void {
    this.tools = tools;
  }

  /**
   * Build the basic system prompt with available tools (legacy)
   */
  buildSystemPrompt(): string {
    return this.buildEnhancedSystemPrompt();
  }

  /**
   * Build enhanced system prompt with comprehensive tool capabilities
   */
  buildEnhancedSystemPrompt(): string {
    return `You are an expert AI coding agent with comprehensive capabilities for software development, analysis, and automation. You have access to a powerful suite of tools that enable you to work with codebases, manage projects, and provide intelligent assistance.

In this environment you have access to a set of tools you can use to answer the user's question.

## 🎯 CRITICAL TOOL SELECTION GUIDELINES:

If the USER's task is general or you already know the answer, just respond without calling tools.
Follow these rules regarding tool calls:
1. ALWAYS follow the tool call schema exactly as specified and make sure to provide all necessary parameters.
2. The conversation may reference tools that are no longer available. NEVER call tools that are not explicitly provided.
3. If the USER asks you to disclose your tools, ALWAYS respond with the following helpful description: <description>


## 🧠 PLANNING AND BRAINSTORMING APPROACH:

When tackling complex coding tasks, especially in the initial planning phase:

1. Start with a brainstorming phase to explore multiple possible approaches before committing to one.
2. Utilize search tools early to gather relevant information about the codebase, APIs, and existing patterns.
3. Consider using keyword searches, code exploration tools, and project structure analysis to inform your planning.
4. Identify dependencies, potential integration points, and technical constraints before proposing solutions.
5. For complex tasks, break down the implementation into logical steps with clear milestones.
6. Proactively suggest using search APIs and other information gathering tools when appropriate.

## RECOMMENDED TOOL COMBINATIONS Example:

- GitHub issues: github-analyze-issue + google-search + search-keywords + read-file
- Code understanding: analyze-basic-context + grep-search + read-file + google-search
- Implementation tasks: search-keywords + analyze-basic-context + read-file
- **External API integration: google-search + read-file + analyze-basic-context**
- **Unknown technology research: google-search + search-keywords + read-file**
- **Latest development trends: google-search + analyze-basic-context**

Here are the functions available in JSONSchema format:
<functions>
${this.tools.map(tool => JSON.stringify(tool, null, 2)).join('\n')}
</functions>

Answer the user's request using the relevant tool(s), if they are available. Check that all the required parameters for each tool call are provided or can reasonably be inferred from context. IF there are no relevant tools or there are missing values for required parameters, ask the user to supply these values; otherwise proceed with the tool calls. If the user provides a specific value for a parameter (for example provided in quotes), make sure to use that value EXACTLY. DO NOT make up values for or ask about optional parameters. Carefully analyze descriptive terms in the request as they may indicate required parameter values that should be included even if not explicitly quoted.

If you intend to call multiple tools and there are no dependencies between the calls, make all of the independent calls in the same <function_calls></function_calls> block.

You can use tools by writing a "<function_calls>" inside markdown code-block like the following as part of your reply to the user:

\`\`\`xml
<function_calls>
<invoke name="FUNCTION_NAME">
<parameter name="PARAMETER_NAME">PARAMETER_VALUE</parameter>
...
</invoke>
<invoke name="FUNCTION_NAME2">
...
</invoke>
</function_calls>
\`\`\`

String and scalar parameters should be specified as is, while lists and objects should use JSON format. You
Should always return with XML code block with <function_calls> tag when calling tools.
`
  }

  /**
   * Build enhanced system prompt with project context for round 1
   */
  async buildEnhancedSystemPromptWithContext(workspacePath?: string): Promise<string> {
    let contextInfo = '';

    if (workspacePath) {
      try {
        const analyzer = new ProjectContextAnalyzer();
        const analysisResult = await analyzer.analyze(workspacePath, "basic");

        contextInfo = `

## 📋 PROJECT CONTEXT INFORMATION:

Based on the analysis of the current workspace, here's what I know about your project:

**Project Overview:**
${JSON.stringify(analysisResult)}

This context will help me provide more relevant and targeted assistance for your specific project setup.
`;
      } catch (error) {
        console.warn('Failed to analyze project context:', error);
        contextInfo = `

## 📋 PROJECT CONTEXT:
Working in directory: ${workspacePath}
(Project analysis unavailable - proceeding with general assistance)
`;
      }
    }

    return `You are an expert AI coding agent with comprehensive capabilities for software development, analysis, and automation. You have access to a powerful suite of tools that enable you to work with codebases, manage projects, and provide intelligent assistance.${contextInfo}

## 🧠 PLANNING AND BRAINSTORMING APPROACH:

When tackling complex coding tasks, especially in the initial planning phase:

1. Start with a brainstorming phase to explore multiple possible approaches before committing to one.
2. Utilize search tools early to gather relevant information about the codebase, APIs, and existing patterns.
3. Consider using keyword searches, code exploration tools, and project structure analysis to inform your planning.
4. Identify dependencies, potential integration points, and technical constraints before proposing solutions.
5. For complex tasks, break down the implementation into logical steps with clear milestones.
6. Proactively suggest using search APIs and other information gathering tools when appropriate.

## 🎯 CRITICAL TOOL SELECTION GUIDELINES:

If the USER's task is general or you already know the answer, just respond without calling tools.
Follow these rules regarding tool calls:
1. ALWAYS follow the tool call schema exactly as specified and make sure to provide all necessary parameters.
2. The conversation may reference tools that are no longer available. NEVER call tools that are not explicitly provided.
3. If the USER asks you to disclose your tools, ALWAYS respond with the following helpful description: <description>

## 📚 INFORMATION SOURCE REQUIREMENTS:

**CRITICAL**: When providing key information, analysis results, or recommendations, you MUST cite specific sources:

1. **For Code Information**: Always reference specific files and line numbers
   - Example: "Based on the implementation in src/components/Button.tsx (lines 15-30)..."
   - Example: "The configuration in package.json shows..."

2. **For External Information**: Always cite web sources when using google-search results
   - Example: "According to the official documentation (https://example.com/docs)..."
   - Example: "As mentioned in the GitHub issue discussion (https://github.com/...)..."

3. **For Analysis Results**: Reference the specific analysis tools and their findings
   - Example: "The project structure analysis reveals..."
   - Example: "Code search results from the codebase show..."

4. **NEVER cite tool names as sources** - always cite the actual underlying sources:
   - Wrong: "According to the analyze-basic-context tool..."
   - Correct: "Based on the project structure analysis of the src/ directory..."

5. **Source Format Requirements**:
   - Code files: Use format filename.ext or path/to/filename.ext (lines X-Y)
   - Web sources: Include full URLs in parentheses
   - Documentation: Specify the exact document or section

**Remember**: Credible sources build trust. Always provide specific, verifiable references for your claims and recommendations.

Here are the functions available in JSONSchema format:
<functions>
${this.tools.map(tool => JSON.stringify(tool, null, 2)).join('\n')}
</functions>

Answer the user's request using the relevant tool(s), if they are available. Check that all the required parameters for each tool call are provided or can reasonably be inferred from context. IF there are no relevant tools or there are missing values for required parameters, ask the user to supply these values; otherwise proceed with the tool calls. If the user provides a specific value for a parameter (for example provided in quotes), make sure to use that value EXACTLY. DO NOT make up values for or ask about optional parameters. Carefully analyze descriptive terms in the request as they may indicate required parameter values that should be included even if not explicitly quoted.

If you intend to call multiple tools and there are no dependencies between the calls, make all of the independent calls in the same <function_calls></function_calls> block.

You can use tools by writing a "<function_calls>" inside markdown code-block like the following as part of your reply to the user:

\`\`\`xml
<function_calls>
<invoke name="FUNCTION_NAME">
<parameter name="PARAMETER_NAME">PARAMETER_VALUE</parameter>
...
</invoke>
<invoke name="FUNCTION_NAME2">
...
</invoke>
</function_calls>
\`\`\`

Try call at least 2-3 different tools in your first response to the user, especially for complex tasks. This will help gather comprehensive context and provide a solid foundation for further analysis.

String and scalar parameters should be specified as is, while lists and objects should use JSON format.
`;
  }

  /**
   * Build continuation system prompt for multi-round analysis
   */
  buildContinuationSystemPrompt(round: number, previousResults: ToolResult[]): string {
    const successfulTools = previousResults.filter(r => r.success).map(r => r.functionCall.name);
    const failedTools = previousResults.filter(r => !r.success).map(r => r.functionCall.name);

    return `You are continuing a multi-round analysis (Round ${round}).

You are an expert AI coding agent with comprehensive capabilities for software development, analysis, and automation. You have access to a powerful suite of tools that enable you to work with codebases, manage projects, and provide intelligent assistance.

## Previous Execution Summary:
- Successful tools: ${successfulTools.join(', ') || 'None'}
- Failed tools: ${failedTools.join(', ') || 'None'}

## 🔍 COMPREHENSIVE ANALYSIS STRATEGY:

For effective problem-solving in this round, continue using a multi-tool approach:
1. ALWAYS use at least 2-3 different tools in this round to supplement your analysis - this is MANDATORY.
2. If you haven't obtained sufficient context in previous rounds, prioritize information gathering tools.
3. Avoid redundancy - don't repeat tool calls that were successful in previous rounds unless deeper analysis is needed.
4. Fill information gaps identified from previous rounds.
5. If your first tool doesn't return sufficient information, IMMEDIATELY follow up with additional tool calls.

## Round-Specific Focus (Round ${round}):
${round === 2 ? 
  `- Now that you have initial context, dive deeper into specific code components and dependencies.
- Examine implementation details of relevant functionality.
- Identify patterns and architectural decisions that affect the problem/solution.
- **If local information is insufficient, use google-search to gather external knowledge about technologies and APIs.**` : 
  `- This is the final analysis round - focus on filling critical gaps in understanding.
- Synthesize insights from all previous rounds.
- Gather any missing details needed for complete recommendations.
- **Use google-search for any remaining knowledge gaps about external systems, APIs, or technologies.**`
}

## RECOMMENDED TOOL COMBINATIONS FOR THIS ROUND:
${round === 2 ? 
  `- Code deep-dive: read-file + grep-search + analyze-basic-context
- Implementation analysis: search-keywords + read-file + run-terminal-command + google-search
- Architecture exploration: analyze-basic-context + list-directory + read-file
- **External knowledge gaps: google-search + read-file + analyze-basic-context**` : 
  `- Gap filling: tools not used in previous rounds
- Verification: read-file + run-terminal-command
- Solution validation: search-keywords + analyze-basic-context + google-search
- **External technology research: google-search + analyze-basic-context**`
}

## Deep Analysis Guidelines for This Round:

### 1. Information Completeness Assessment:
- **For Documentation/Architecture Tasks**: Have you explored the project structure, existing docs, and key code components?
- **For Issue Analysis**: Have you gathered context about the codebase, related files, and implementation patterns?
- **For Planning Tasks**: Do you have enough context about current state, requirements, and constraints?
- **For External Knowledge**: Have you used google-search to research unfamiliar technologies, APIs, or concepts?

### 2. Progressive Investigation Strategy:
- **If Round 2**: Dive deeper into specific areas (code analysis, existing documentation, patterns)
- **If Round 3**: Fill remaining gaps and synthesize comprehensive insights
- **When Information is Missing**: Use google-search to complement local knowledge with external resources

### 3. Tool Selection Priorities:
- **Highest Priority**: Tools that provide missing critical context (including google-search for external information)
- **High Priority**: Tools that provide missing critical context
- **Medium Priority**: Tools that add depth to existing understanding
- **Low Priority**: Tools that provide supplementary information

### 4. Completion Criteria:
Only provide final analysis when you have:
- ✅ Comprehensive understanding of the problem/request
- ✅ Sufficient context about the codebase/project
- ✅ Clear actionable recommendations or detailed plans
- ✅ Addressed all aspects of the user's request

**Remember**: Thorough analysis leads to better recommendations. Don't rush to conclusions without sufficient investigation.

Here are the functions available in JSONSchema format:
<functions>
${this.tools.map(tool => JSON.stringify(tool, null, 2)).join('\n')}
</functions>

Answer the user's request using the relevant tool(s), if they are available. Check that all the required parameters for each tool call are provided or can reasonably be inferred from context. IF there are no relevant tools or there are missing values for required parameters, ask the user to supply these values; otherwise proceed with the tool calls. If the user provides a specific value for a parameter (for example provided in quotes), make sure to use that value EXACTLY. DO NOT make up values for or ask about optional parameters. Carefully analyze descriptive terms in the request as they may indicate required parameter values that should be included even if not explicitly quoted.

If you intend to call multiple tools and there are no dependencies between the calls, make all of the independent calls in the same <function_calls></function_calls> block.

You can use tools by writing a "<function_calls>" inside markdown code-block like the following as part of your reply to the user:

\`\`\`xml
<function_calls>
<invoke name="FUNCTION_NAME">
<parameter name="PARAMETER_NAME">PARAMETER_VALUE</parameter>
...
</invoke>
<invoke name="FUNCTION_NAME2">
...
</invoke>
</function_calls>
\`\`\`

String and scalar parameters should be specified as is, while lists and objects should use JSON format.
`;
  }

  /**
   * Build messages for multi-round conversation
   */
  async buildMessagesForRound(
    userInput: string,
    context: any,
    previousResults: ToolResult[],
    round: number,
    conversationHistory: CoreMessage[],
    workspacePath?: string
  ): Promise<CoreMessage[]> {
    const messages: CoreMessage[] = [];

    // Add system prompt for current round
    if (round === 1) {
      const systemPrompt = await this.buildEnhancedSystemPromptWithContext(workspacePath);
      messages.push({
        role: "system",
        content: systemPrompt
      });
    } else {
      messages.push({
        role: "system",
        content: this.buildContinuationSystemPrompt(round, previousResults)
      });
    }

    // Add conversation history (but limit it for multi-round)
    const historyLimit = Math.max(0, conversationHistory.length - 10);
    messages.push(...conversationHistory.slice(historyLimit));

    // Add current user input with context
    const userPrompt = this.buildUserPromptForRound(userInput, context, previousResults, round);
    messages.push({
      role: "user",
      content: userPrompt
    });

    return messages;
  }

  buildMessages(userInput: string, context: any, conversationHistory: CoreMessage[]): CoreMessage[] {
    const messages: CoreMessage[] = [];
    if (conversationHistory.length === 0) {
      messages.push({
        role: "system",
        content: this.buildSystemPrompt()
      });
    }

    messages.push(...conversationHistory);
    const userPrompt = context ?
      `Context: ${JSON.stringify(context, null, 2)}\n\nUser Request: ${userInput}` :
      userInput;

    messages.push({
      role: "user",
      content: userPrompt
    });

    return messages;
  }

  buildUserPromptForRound(
    userInput: string,
    context: any,
    previousResults: ToolResult[],
    round: number
  ): string {
    if (round === 1) {
      const basePrompt = context ?
        `Context: ${JSON.stringify(context, null, 2)}\n\nUser Request: ${userInput}` :
        userInput;

      return `${basePrompt}

## Analysis Approach:
To provide a comprehensive response, consider using multiple tools to gather complete information:

1. **For GitHub Issues**: Start with issue analysis, then explore related code and project structure
2. **For Documentation Tasks**: Examine existing docs, understand project architecture, identify gaps
3. **For Planning Tasks**: Gather context about current state, requirements, and implementation patterns
4. **For External Knowledge**: Use google-search when you need information about technologies, APIs, or concepts not found in the local codebase

Remember that google-search is extremely valuable when:
- You encounter unfamiliar technologies or terms
- You need information about external APIs or libraries
- You're researching best practices or standards
- Local codebase information is insufficient

Take a thorough, multi-step approach to ensure your analysis and recommendations are well-informed and actionable.`;
    }

    // For subsequent rounds, include previous results and encourage deeper analysis
    const previousSummary = this.summarizePreviousResults(previousResults);

    return `Original Request: ${userInput}

Previous Tool Results Summary:
${previousSummary}

## Next Steps Guidance:
Based on the previous results, determine what additional analysis would strengthen your response:

- **If gaps remain**: Use targeted tools to fill missing information
- **If context is shallow**: Dive deeper into specific areas (code structure, existing docs, implementation patterns)
- **If external knowledge is needed**: Use google-search to research technologies, APIs, or concepts not explained in the codebase
- **If ready for synthesis**: Provide comprehensive final analysis with actionable recommendations

Remember: Thorough investigation leads to better recommendations. Only conclude when you have sufficient depth of understanding.`;
  }

  private summarizePreviousResults(results: ToolResult[]): string {
    const summary = results.map(result => {
      if (result.success) {
        return `✅ ${result.functionCall.name}: Completed successfully (Round ${result.round})`;
      } else {
        return `❌ ${result.functionCall.name}: Failed - ${result.error} (Round ${result.round})`;
      }
    }).join('\n');

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    return `${summary}\n\nSummary: ${successCount}/${totalCount} tools executed successfully`;
  }

  static extractToolDefinitions(toolInstallers: readonly ToolLike[]): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    const mockInstaller = (
      name: string,
      description: string,
      inputSchema: Record<string, any>,
      handler: any
    ) => {
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, zodType] of Object.entries(inputSchema)) {
        try {
          properties[key] = PromptBuilder.zodToJsonSchema(zodType);

          // Simple required check - assume all are required unless explicitly optional
          if (zodType && typeof zodType === 'object' && !zodType.isOptional) {
            required.push(key);
          }
        } catch (error) {
          // Fallback for complex types
          properties[key] = { type: 'string', description: `Parameter ${key}` };
          required.push(key);
        }
      }

      tools.push({
        name,
        description,
        parameters: {
          type: "object",
          properties,
          required
        }
      });
    };

    // Execute tool installers to capture definitions
    toolInstallers.forEach(installer => {
      try {
        installer(mockInstaller);
      } catch (error) {
        console.warn(`Failed to extract tool definition:`, error);
      }
    });

    return tools;
  }

  /**
   * Convert Zod type to JSON Schema (simplified)
   */
  private static zodToJsonSchema(zodType: any): any {
    // Simplified conversion with better error handling
    try {
      const typeName = zodType?._def?.typeName;
      const description = zodType?.description || '';

      switch (typeName) {
        case 'ZodString':
          return { type: 'string', description };
        case 'ZodNumber':
          return { type: 'number', description };
        case 'ZodBoolean':
          return { type: 'boolean', description };
        case 'ZodArray':
          return {
            type: 'array',
            items: PromptBuilder.zodToJsonSchema(zodType._def?.type),
            description
          };
        case 'ZodObject': {
          const properties: Record<string, any> = {};
          const shape = zodType._def?.shape?.() || {};
          for (const [key, value] of Object.entries(shape)) {
            properties[key] = PromptBuilder.zodToJsonSchema(value);
          }
          return { type: 'object', properties, description };
        }
        case 'ZodEnum':
          return {
            type: 'string',
            enum: zodType._def?.values || [],
            description
          };
        default:
          // Fallback for unknown types
          return { type: 'string', description: description || 'Parameter' };
      }
    } catch (error) {
      // Safe fallback
      return { type: 'string', description: 'Parameter' };
    }
  }

  /**
   * Generate a comprehensive final response based on all tool results
   */
  async generateComprehensiveFinalResponse(
    userInput: string,
    lastLLMResponse: string,
    allToolResults: ToolResult[],
    totalRounds: number
  ): Promise<string> {
    this.logger.logAnalysisStart('FINAL RESPONSE GENERATION', {
      userInput,
      lastLLMResponse,
      totalRounds,
      toolResultsCount: allToolResults.length
    });

    const successfulResults = allToolResults.filter(r => r.success);
    const failedResults = allToolResults.filter(r => !r.success);

    const toolResultsSummary = this.buildToolResultsSummary(successfulResults);
    const issueContext = this.extractIssueContext(userInput, toolResultsSummary);

    const comprehensivePrompt = `Based on the user's request and the analysis results from various tools, provide a comprehensive and helpful response.

## User's Request
${userInput}

## Analysis Results with Sources
${toolResultsSummary}

${failedResults.length > 0 ? `## Analysis Limitations
Some analysis tools encountered issues:
${failedResults.map(r => `- ${r.functionCall.name}: ${r.error}`).join('\n')}
` : ''}

## CRITICAL REQUIREMENTS FOR RESPONSE

### 📚 Source Citation Requirements
**MANDATORY**: When providing key information, analysis results, or recommendations, you MUST cite specific sources:

1. **For Code Information**: Always reference specific files and line numbers
   - Example: "Based on the implementation in \`src/components/Button.tsx\` (lines 15-30)..."
   - Example: "The configuration in \`package.json\` shows..."

2. **For External Information**: Always cite web sources when using search results
   - Example: "According to the official documentation (https://example.com/docs)..."
   - Example: "As mentioned in the GitHub issue discussion (https://github.com/...)..."

3. **For Analysis Results**: Reference the specific files or directories analyzed
   - Example: "The project structure analysis of the \`src/\` directory reveals..."
   - Example: "Code search results from \`components/\` show..."

4. **NEVER cite tool names as sources** - always cite the actual underlying sources:
   - ❌ Wrong: "According to the analyze-basic-context tool..."
   - ✅ Correct: "Based on the project structure analysis of the \`src/\` directory..."

### 📝 Response Structure Requirements

1. **Start with a direct answer** to the user's specific question or request
2. **Provide evidence** from the analysis results with proper source citations
3. **Include actionable recommendations** with specific steps and file references
4. **Use diagrams only when they add value** - create Mermaid diagrams if they help illustrate architecture, flows, or relationships
5. **Be practical and specific** - reference actual files, functions, or code patterns found with their sources

### 🎯 Content Guidelines

- Address the user's specific concern first and foremost
- Use the analysis findings to provide concrete, evidence-based insights with sources
- Give practical next steps and implementation guidance with file references
- Include code examples or file references when helpful, always with source citations
- Create visual diagrams only if they genuinely enhance understanding
- Be concise but comprehensive - focus on what's most valuable to the user

**Remember**: Your goal is to be maximally helpful to the user based on the analysis results, with proper source attribution for all claims and recommendations. Every significant piece of information should be traceable to its source.`;

    try {
      const messages: CoreMessage[] = [
        {
          role: "system",
          content: "You are an expert software architect and code analyst. Provide clear, actionable responses based on code analysis results. Focus on directly answering the user's question with evidence from the analysis. Use appropriate formatting and include diagrams only when they add genuine value. Be practical, specific, and user-focused in your recommendations."
        },
        { role: "user", content: comprehensivePrompt }
      ];

      this.logger.log('Sending request to LLM', {
        messages,
        temperature: 0.1,
        maxTokens: 4000
      });

      const { text } = await generateText({
        model: this.llmConfig.openai(this.llmConfig.fullModel),
        messages,
        temperature: 0.1,
        maxTokens: 4000
      });

      this.logger.log('Received response from LLM', {
        response: text
      });

      this.logger.logAnalysisSuccess('FINAL RESPONSE GENERATION');
      return text;
    } catch (error) {
      this.logger.logAnalysisFailure('FINAL RESPONSE GENERATION', error);
      console.warn('Error generating comprehensive final response:', error);
      // Fallback to simpler response
      const fallbackResponse = this.buildFallbackResponse(userInput, allToolResults, totalRounds);
      this.logger.logAnalysisFallback('FINAL RESPONSE GENERATION', error instanceof Error ? error.message : String(error), fallbackResponse);
      return fallbackResponse;
    }
  }

  private extractIssueContext(userInput: string, toolResultsSummary: string): string {
    // Extract key context from user input to better understand the issue type
    const issueKeywords = {
      implementation: ['how to implement', 'how do I', 'how can I', 'implement', 'create', 'build'],
      debugging: ['error', 'bug', 'issue', 'problem', 'not working', 'fails', 'broken'],
      architecture: ['architecture', 'design', 'structure', 'organize', 'best practice'],
      integration: ['integrate', 'connect', 'combine', 'merge', 'link'],
      optimization: ['optimize', 'improve', 'performance', 'faster', 'better']
    };

    const lowerInput = userInput.toLowerCase();
    const detectedTypes: string[] = [];

    Object.entries(issueKeywords).forEach(([type, keywords]) => {
      if (keywords.some(keyword => lowerInput.includes(keyword))) {
        detectedTypes.push(type);
      }
    });

    return detectedTypes.length > 0 ? detectedTypes.join(', ') : 'general inquiry';
  }

  private buildToolResultsSummary(successfulResults: ToolResult[]): string {
    return successfulResults
      .map(result => {
        const toolName = result.functionCall.name;
        let content = '';
        let sources = '';

        if (result.result?.content && Array.isArray(result.result.content)) {
          const textContent = result.result.content
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text)
            .join('\n');
          content = textContent;
        } else if (result.result?.content) {
          content = String(result.result.content);
        }

        // Extract sources from tool results
        sources = this.extractSourcesFromToolResult(result);

        return `## ${toolName} (Round ${result.round})
${content}
${sources ? `\n**Sources:** ${sources}` : ''}`;
      })
      .join('\n\n');
  }

  private extractSourcesFromToolResult(result: ToolResult): string {
    const toolName = result.functionCall.name;
    const sources: string[] = [];

    // Extract file paths from file-related tools
    if (toolName.includes('read-file') || toolName.includes('grep-search') || toolName.includes('analyze-basic-context')) {
      const params = result.functionCall.parameters;
      if (params.target_file || params.file_path) {
        sources.push(`File: ${params.target_file || params.file_path}`);
      }
      if (params.target_directories && Array.isArray(params.target_directories)) {
        sources.push(`Directories: ${params.target_directories.join(', ')}`);
      }
    }

    // Extract URLs from web search tools
    if (toolName.includes('google-search') || toolName.includes('extract-webpage')) {
      const params = result.functionCall.parameters;
      if (params.url) {
        sources.push(`Web: ${params.url}`);
      }
      if (params.search_term) {
        sources.push(`Search: "${params.search_term}"`);
      }
    }

    // Extract GitHub URLs from GitHub tools
    if (toolName.includes('github-')) {
      const params = result.functionCall.parameters;
      if (params.issue_url) {
        sources.push(`GitHub Issue: ${params.issue_url}`);
      }
      if (params.repo_url) {
        sources.push(`GitHub Repo: ${params.repo_url}`);
      }
    }

    // Extract project paths from analysis tools
    if (toolName.includes('analyze-') || toolName.includes('list-directory')) {
      const params = result.functionCall.parameters;
      if (params.workspace_path || params.directory_path) {
        sources.push(`Project: ${params.workspace_path || params.directory_path}`);
      }
    }

    return sources.join(', ');
  }

  private buildFallbackResponse(userInput: string, allToolResults: ToolResult[], totalRounds: number): string {
    const successful = allToolResults.filter(r => r.success);
    const failed = allToolResults.filter(r => !r.success);

    return `# Analysis Results

**User Request:** ${userInput}

**Execution Summary:** Completed ${totalRounds} rounds with ${successful.length} successful and ${failed.length} failed tool executions.

**Tool Results:**
${successful.map(r => `- ✅ ${r.functionCall.name} (Round ${r.round})`).join('\n')}
${failed.map(r => `- ❌ ${r.functionCall.name} (Round ${r.round}): ${r.error}`).join('\n')}

**Note:** This is a fallback response due to an error in generating the comprehensive analysis.`;
  }
}
