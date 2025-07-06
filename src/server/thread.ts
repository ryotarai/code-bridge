export const generateSlackThreadId = ({
  channelId,
  threadTs,
}: {
  channelId: string;
  threadTs: string;
}): string => {
  return `slack/${channelId}/${threadTs}`;
};

export const parseThreadId = (
  threadId: string
): { type: 'slack'; channelId: string; threadTs: string } => {
  const [type, channelId, threadTs] = threadId.split('/');
  if (type !== 'slack') {
    throw new Error('Invalid thread ID');
  }
  return { type, channelId, threadTs };
};
