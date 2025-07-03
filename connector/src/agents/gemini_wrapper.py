#!/usr/bin/env python3
"""
Gemini CLI Wrapper for DuckBridge Agent System
"""

import sys
import json
import argparse
import os
from typing import Optional, Dict, Any

try:
    import google.generativeai as genai
except ImportError:
    print("Error: google-generativeai package not installed")
    print("Install with: pip install google-generativeai")
    sys.exit(1)

class GeminiCLI:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv('GOOGLE_AI_API_KEY')
        if not self.api_key:
            raise ValueError("GOOGLE_AI_API_KEY environment variable must be set")
        
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel('gemini-pro')
    
    def generate_text(self, prompt: str, max_tokens: Optional[int] = None) -> Dict[str, Any]:
        """Generate text using Gemini Pro"""
        try:
            response = self.model.generate_content(prompt)
            return {
                'success': True,
                'text': response.text,
                'usage': {
                    'prompt_tokens': len(prompt.split()),
                    'completion_tokens': len(response.text.split()) if response.text else 0
                }
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def analyze_code(self, code: str, analysis_type: str = 'general') -> Dict[str, Any]:
        """Analyze code with specific focus"""
        prompt = f"""
Please analyze the following code with focus on {analysis_type}:

{code}

Provide:
1. Code structure analysis
2. Quality assessment
3. Potential improvements
4. Security considerations
5. Performance insights
"""
        return self.generate_text(prompt)
    
    def solve_problem(self, problem: str, context: str = '') -> Dict[str, Any]:
        """Solve a problem with optional context"""
        prompt = f"""
Problem: {problem}

Context: {context}

Please provide:
1. Problem analysis
2. Potential solutions
3. Step-by-step approach
4. Considerations and trade-offs
"""
        return self.generate_text(prompt)
    
    def process_data(self, data: str, task: str) -> Dict[str, Any]:
        """Process data according to specified task"""
        prompt = f"""
Task: {task}

Data:
{data}

Please analyze the data and provide insights based on the specified task.
"""
        return self.generate_text(prompt)

def main():
    parser = argparse.ArgumentParser(description='Gemini CLI Wrapper')
    parser.add_argument('command', choices=['generate', 'analyze', 'solve', 'process'])
    parser.add_argument('--prompt', required=True, help='Input prompt or text')
    parser.add_argument('--type', default='general', help='Analysis or processing type')
    parser.add_argument('--context', default='', help='Additional context')
    parser.add_argument('--max-tokens', type=int, help='Maximum tokens to generate')
    parser.add_argument('--output-format', choices=['json', 'text'], default='json')
    
    args = parser.parse_args()
    
    try:
        cli = GeminiCLI()
        
        if args.command == 'generate':
            result = cli.generate_text(args.prompt, args.max_tokens)
        elif args.command == 'analyze':
            result = cli.analyze_code(args.prompt, args.type)
        elif args.command == 'solve':
            result = cli.solve_problem(args.prompt, args.context)
        elif args.command == 'process':
            result = cli.process_data(args.prompt, args.type)
        
        if args.output_format == 'json':
            print(json.dumps(result, indent=2))
        else:
            if result.get('success'):
                print(result.get('text', ''))
            else:
                print(f"Error: {result.get('error', 'Unknown error')}")
                sys.exit(1)
                
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e)
        }
        if args.output_format == 'json':
            print(json.dumps(error_result, indent=2))
        else:
            print(f"Error: {e}")
            sys.exit(1)

if __name__ == '__main__':
    main()
