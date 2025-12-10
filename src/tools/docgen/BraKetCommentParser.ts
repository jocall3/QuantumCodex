import * as fs from 'fs';

export type BraKetType = 'bra' | 'ket';

export interface BraKetToken {
    /**
     * The type of the tag: 'bra' for <tag| and 'ket' for |tag>
     */
    type: BraKetType;
    /**
     * The identifier inside the tag. 
     * E.g., for |param>, name is "param".
     */
    name: string;
    /**
     * The content immediately following the tag until the next tag or end of comment.
     */
    content: string;
    /**
     * The line number in the source file where this tag starts (1-based).
     */
    lineNumber: number;
    /**
     * The raw string match.
     */
    raw: string;
}

export interface ParsedDocumentation {
    tokens: BraKetToken[];
    rawComments: string[];
}

/**
 * A parser specialized in extracting semantic documentation tags 
 * using the Bra-Ket notation (|ket> and <bra|) from source code comments.
 * 
 * Supported Syntax:
 * - Ket: |tagName> Content...
 * - Bra: <tagName| Content...
 */
export class BraKetCommentParser {
    private static readonly KET_REGEX = /\|([a-zA-Z0-9_\-\.]+)\>/;
    private static readonly BRA_REGEX = /\<([a-zA-Z0-9_\-\.]+)\|/;
    
    // Regex to capture comments: // single line or /* multi line */
    private static readonly COMMENT_REGEX = /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)/g;

    /**
     * Parses a source string to extract BraKet documentation tokens.
     * @param sourceCode The raw source code of the .u file.
     * @returns An object containing extracted tokens and raw comment blocks.
     */
    public parse(sourceCode: string): ParsedDocumentation {
        const tokens: BraKetToken[] = [];
        const rawComments: string[] = [];
        
        let match: RegExpExecArray | null;

        // Iterate over all comment blocks in the source code
        while ((match = BraKetCommentParser.COMMENT_REGEX.exec(sourceCode)) !== null) {
            const commentBlock = match[0];
            const startIndex = match.index;
            
            // Calculate starting line number for this comment block
            const preMatch = sourceCode.substring(0, startIndex);
            const startLine = preMatch.split('\n').length;

            rawComments.push(commentBlock);
            
            const blockTokens = this.parseCommentBlock(commentBlock, startLine);
            tokens.push(...blockTokens);
        }

        return { tokens, rawComments };
    }

    /**
     * Parses a specific comment block (single or multi-line) for BraKet tags.
     */
    private parseCommentBlock(comment: string, startLine: number): BraKetToken[] {
        const tokens: BraKetToken[] = [];
        
        // Normalize comment: remove comment markers (//, /*, */, *) to isolate content
        const lines = comment.split('\n');
        
        let currentToken: BraKetToken | null = null;

        lines.forEach((line, index) => {
            const currentLineNumber = startLine + index;
            const cleanLine = this.cleanLine(line);

            // Check for tags in the line
            // We scan the line for occurrences of |...> or <...|
            // Note: A single line might contain multiple tags, or text belonging to a previous tag.
            
            let remainingLine = cleanLine;
            
            while (remainingLine.length > 0) {
                const ketMatch = remainingLine.match(BraKetCommentParser.KET_REGEX);
                const braMatch = remainingLine.match(BraKetCommentParser.BRA_REGEX);

                const firstMatchIndex = this.findFirstMatch(ketMatch, braMatch);

                if (firstMatchIndex === -1) {
                    // No new tags found in the rest of this line.
                    // Append text to current token if exists.
                    if (currentToken) {
                        currentToken.content += (currentToken.content ? '\n' : '') + remainingLine.trim();
                    }
                    break; 
                }

                // We found a tag.
                // 1. If there is text before the tag, append it to the previous token.
                const textBefore = remainingLine.substring(0, firstMatchIndex).trim();
                if (textBefore && currentToken) {
                    currentToken.content += (currentToken.content ? '\n' : '') + textBefore;
                }

                // 2. Create the new token.
                const isKet = (ketMatch && ketMatch.index === firstMatchIndex);
                const matchObj = isKet ? ketMatch! : braMatch!;
                
                // Finalize previous token
                if (currentToken) {
                    tokens.push(currentToken);
                }

                currentToken = {
                    type: isKet ? 'ket' : 'bra',
                    name: matchObj[1],
                    content: '', // Content will be filled by subsequent text
                    lineNumber: currentLineNumber,
                    raw: matchObj[0]
                };

                // Advance the string past the match
                remainingLine = remainingLine.substring(firstMatchIndex + matchObj[0].length);
            }
        });

        // Push the last token found in the block
        if (currentToken) {
            tokens.push(currentToken);
        }

        return tokens;
    }

    /**
     * Determines which match (Bra or Ket) appears first in the string.
     */
    private findFirstMatch(ketMatch: RegExpMatchArray | null, braMatch: RegExpMatchArray | null): number {
        if (!ketMatch && !braMatch) return -1;
        if (ketMatch && !braMatch) return ketMatch.index!;
        if (!ketMatch && braMatch) return braMatch.index!;
        
        // Both exist, return the smaller index
        return Math.min(ketMatch!.index!, braMatch!.index!);
    }

    /**
     * Strips comment syntax characters to reveal the inner text.
     */
    private cleanLine(line: string): string {
        // Remove //
        line = line.replace(/^\s*\/\//, '');
        // Remove /* or */
        line = line.replace(/^\s*\/\*+/, '').replace(/\*+\/\s*$/, '');
        // Remove leading * common in block comments
        line = line.replace(/^\s*\*\s?/, '');
        return line;
    }

    /**
     * Utility to group tokens by their tag name.
     * Useful for aggregating |param> tags, etc.
     */
    public groupTokensByName(tokens: BraKetToken[]): Record<string, BraKetToken[]> {
        return tokens.reduce((acc, token) => {
            if (!acc[token.name]) {
                acc[token.name] = [];
            }
            acc[token.name].push(token);
            return acc;
        }, {} as Record<string, BraKetToken[]>);
    }
}