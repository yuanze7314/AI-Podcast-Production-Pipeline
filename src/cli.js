import 'dotenv/config';
import { podcastPipeline } from './pipeline.js';

function printUsage() {
  console.log(`
AI Podcast Production Pipeline

Commands:
  all                 Run phase1, phase2, review, audio, and merge
  phase1              Parse book and mine chapter knowledge
  phase2              Generate and review dialogue scripts
  review              Export readable dialogue Markdown and JSON
  audio [chapter|all] Generate chapter audio, or all chapter audio
  merge               Merge generated chapter audio into one MP3
  status              Show current production artifact status
`);
}

async function main() {
  const [command = 'status', target = 'all'] = process.argv.slice(2);

  switch (command) {
    case 'all':
      await podcastPipeline.runPhase1();
      await podcastPipeline.runPhase2();
      await podcastPipeline.generateAllAudio();
      podcastPipeline.mergeAudio();
      break;
    case 'phase1':
      await podcastPipeline.runPhase1();
      break;
    case 'phase2':
      await podcastPipeline.runPhase2();
      break;
    case 'review':
      podcastPipeline.prepareReviewArtifacts();
      break;
    case 'audio':
      if (target === 'all') {
        await podcastPipeline.generateAllAudio();
      } else {
        await podcastPipeline.generateChapterAudio(target);
      }
      break;
    case 'merge':
      podcastPipeline.mergeAudio();
      break;
    case 'status':
      console.log(JSON.stringify(podcastPipeline.status(), null, 2));
      break;
    case 'help':
    case '--help':
    case '-h':
      printUsage();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
