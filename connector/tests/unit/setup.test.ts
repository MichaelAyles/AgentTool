describe('Test Setup Verification', () => {
  test('should have Jest working', () => {
    expect(true).toBe(true);
  });

  test('should have test utilities available', () => {
    expect(global.testUtils).toBeDefined();
    expect(global.testUtils.generateTestUuid).toBeDefined();
    expect(global.testUtils.waitForCondition).toBeDefined();
  });

  test('should generate valid UUIDs', () => {
    const uuid = global.testUtils.generateTestUuid();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  test('should wait for conditions', async () => {
    let condition = false;
    setTimeout(() => { condition = true; }, 100);
    
    const result = await global.testUtils.waitForCondition(() => condition, 1000);
    expect(result).toBe(true);
  });
});