# Testing Plan for Utils.js Functions

This document outlines test cases for the utility functions in `src/js/utils.js` as part of task MED-04.

## Function: formatCurrency

**Test Cases:**
1. Format whole number (e.g., 1000 → "$1,000")
2. Format decimal number (e.g., 1000.50 → "$1,000.50")
3. Format zero (e.g., 0 → "$0")
4. Format negative number (e.g., -1000 → "-$1,000")
5. Handle undefined/null inputs (should throw or return meaningful error)

**Implementation:**
```javascript
describe('formatCurrency', () => {
  test('formats whole numbers correctly', () => {
    expect(formatCurrency(1000)).toBe('$1,000');
  });
  
  test('formats decimal numbers correctly', () => {
    expect(formatCurrency(1000.50)).toBe('$1,000.50');
  });
  
  test('formats zero correctly', () => {
    expect(formatCurrency(0)).toBe('$0');
  });
  
  test('formats negative numbers correctly', () => {
    expect(formatCurrency(-1000)).toBe('-$1,000');
  });
  
  test('handles invalid inputs', () => {
    expect(() => formatCurrency(undefined)).toThrow();
    expect(() => formatCurrency(null)).toThrow();
  });
});
```

## Function: calculatePayment

**Test Cases:**
1. Calculate payment with standard interest rate
2. Calculate payment with zero interest rate (edge case)
3. Calculate payment with zero down payment
4. Calculate payment with very large values
5. Calculate payment with very long term (many months)
6. Handle invalid inputs (negative numbers, etc.)

**Implementation:**
```javascript
describe('calculatePayment', () => {
  test('calculates payment correctly with interest', () => {
    // Price: $20,000, Down: $2,000, Term: 60 months, Rate: 5%
    // Expected monthly payment: ~$339.00
    const payment = calculatePayment(20000, 2000, 60, 5);
    expect(payment).toBeCloseTo(339.00, 2);
  });
  
  test('calculates payment correctly with zero interest', () => {
    // Price: $20,000, Down: $2,000, Term: 60 months, Rate: 0%
    // Expected monthly payment: $300.00
    const payment = calculatePayment(20000, 2000, 60, 0);
    expect(payment).toBe(300);
  });
  
  test('handles zero down payment', () => {
    const payment = calculatePayment(20000, 0, 60, 5);
    expect(payment).toBeGreaterThan(0);
  });
});
```
