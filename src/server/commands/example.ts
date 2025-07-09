import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../index.js';
import { logger as pinoLogger } from '../logger.js';

export function createExampleCommand(): Command {
  const command = new Command('example');
  
  command
    .description('Example command with various options')
    .option('-v, --verbose', 'verbose output')
    .option('-f, --file <path>', 'input file path')
    .option('-o, --output <path>', 'output file path')
    .action((options) => {
      if (options.verbose) {
        logger('Running in verbose mode', 'info');
      }
      
      pinoLogger.info(chalk.cyan('🔧 Example command executed!'));
      
      if (options.file) {
        pinoLogger.info(chalk.gray(`Input file: ${options.file}`));
      }
      
      if (options.output) {
        pinoLogger.info(chalk.gray(`Output file: ${options.output}`));
      }
      
      pinoLogger.info(chalk.green('✅ Command completed successfully!'));
    });
    
  return command;
}