/**
 * Basic test to verify Jest configuration is working
 */

describe('Jest Configuration', () => {
  test('should run a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  test('should handle async operations', async () => {
    const result = await Promise.resolve('hello');
    expect(result).toBe('hello');
  });

  test('should have access to environment variables', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });
});