import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import '@brokercomply/shared'; // loads the root .env into process.env

/** Connectivity test for the LLM (Anthropic) and embeddings (OpenAI) keys. */
async function testAnthropic(): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.LLM_API_KEY;
  if (!apiKey) {
    console.log('❌ Anthropic: no ANTHROPIC_API_KEY / LLM_API_KEY in .env');
    return false;
  }
  const model = process.env.LLM_MODEL || 'claude-sonnet-4-6';
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    });
    const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    console.log(`✅ Anthropic (${model}): "${text}"  [in=${res.usage.input_tokens} out=${res.usage.output_tokens} tokens]`);
    return true;
  } catch (error) {
    const e = error as { status?: number; message?: string };
    console.log(`❌ Anthropic (${model}): ${e.status ?? ''} ${e.message ?? String(error)}`);
    return false;
  }
}

async function testEmbeddings(): Promise<boolean> {
  const apiKey = process.env.EMBEDDING_API_KEY;
  if (!apiKey) {
    console.log('❌ Embeddings: no EMBEDDING_API_KEY in .env');
    return false;
  }
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  try {
    const client = new OpenAI({ apiKey });
    const res = await client.embeddings.create({
      model,
      input: 'Test de connexion embeddings pour BrokerComply.',
    });
    const dims = res.data[0]?.embedding.length ?? 0;
    const ok = dims === 1536;
    console.log(
      `${ok ? '✅' : '⚠️ '} Embeddings (${model}): ${dims} dimensions  [${res.usage.total_tokens} tokens]` +
        (ok ? '' : ' — expected 1536 to match the vector(1536) column'),
    );
    return dims > 0;
  } catch (error) {
    const e = error as { status?: number; message?: string };
    console.log(`❌ Embeddings (${model}): ${e.status ?? ''} ${e.message ?? String(error)}`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('Testing LLM + embedding credentials…\n');
  const [llmOk, embOk] = await Promise.all([testAnthropic(), testEmbeddings()]);
  console.log(`\n${llmOk && embOk ? 'All keys working.' : 'One or more keys failed (see above).'}`);
  if (!llmOk || !embOk) process.exitCode = 1;
}

void main();
