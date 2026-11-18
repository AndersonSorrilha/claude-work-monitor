# claude-work-monitor

Dois mods para o Claude Code que deixam mais fácil acompanhar o que o Claude está fazendo.

## work-monitor

Um painel ao lado da conversa que acompanha o turno em andamento:

- **Estado e cronômetro**: `Working` ou `Idle`, modelo, projeto e tempo decorrido.
- **Plan**: a lista de tarefas do Claude, com o progresso (`2 of 7`) e o item em andamento destacado.
- **Changes**: linhas adicionadas e removidas por arquivo a cada `Write` e `Edit` (contagem aproximada, não um diff real).
- **Files**: arquivos lidos.
- **Tests**: comandos de teste executados (`npm test`, `pytest`, `phpunit`, `artisan test`, `go test` e outros) e o resultado.
- **Agents**: subagentes da sessão, com estado e tokens usados.
- **Context**: uso da janela de contexto e custo estimado.

Enquanto houver subagente rodando, uma grade de cartões aparece acima da caixa de mensagem, um cartão por agente, com a descrição da tarefa, o que ele está fazendo e uma barra de atividade. O Claude Code não informa percentual de progresso por agente, então a barra é indeterminada e o cartão mostra os tokens usados.

O comando `/monitor` abre o painel. Ele encaixa sozinho ao lado da conversa em terminais largos (144 colunas, ou 110 depois que você o abriu uma vez).

## answer-card

Desenha a resposta final de cada turno dentro de um card com borda fina verde, para destacar o que é para ler. As frases intermediárias, ditas enquanto o Claude trabalha, ficam sem card.

## Instalação

No prompt de uma sessão do Claude Code no terminal:

```
/plugin install work-monitor --marketplace AndersonSorrilha/claude-work-monitor
/plugin install answer-card --marketplace AndersonSorrilha/claude-work-monitor
```

Responda `y` para adicionar o marketplace e escolha o escopo de usuário para valer em todas as sessões.

Pelo shell:

```
claude plugin install work-monitor --marketplace AndersonSorrilha/claude-work-monitor
claude plugin install answer-card --marketplace AndersonSorrilha/claude-work-monitor
```

No app desktop, onde `/plugin` não roda: clique em + ao lado da caixa de mensagem, depois Plugins, Add marketplace com `AndersonSorrilha/claude-work-monitor`, e então Add plugin.

## Desenvolvimento

Cada mod é uma pasta com `.claude-plugin/plugin.json`, `hooks/register.tsx`, o contrato de estado em `types/index.d.ts` e os testes em `tests/`.

```
claude plugin validate work-monitor
claude plugin test work-monitor
```

A API de mods do Claude Code está em acesso antecipado e pode mudar entre versões.
